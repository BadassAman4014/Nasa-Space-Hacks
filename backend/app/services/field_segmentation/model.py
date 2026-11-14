"""Fields of the World (FTW-PRUE+) and Fields of the Planet (FTP-B3) Field Segmentation Models.

Primary Model:
- Repository: https://huggingface.co/fieldsoftheworld/ftw-prue-ccby
- Model: FTW-PRUE+ EfficientNet-B3 U-Net (Sentinel-2 Native)
- Architecture: U-Net decoder with an EfficientNet-B3 encoder (segmentation_models_pytorch).
- Input: 8 channels (bi-temporal surface reflectance: 2 dates x [B04 Red, B03 Green, B02 Blue, B08 NIR]).
  Single 4-band Sentinel-2 inputs are formatted as [B04, B03, B02, B08, B04, B03, B02, B08] and scaled by 10000/3000.
- Output: 3-class pixel-wise probability maps (0: Background, 1: Field Interior, 2: Field Boundary).
"""

from typing import Optional, Tuple
import os
import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np

# Try importing segmentation_models_pytorch
try:
    import segmentation_models_pytorch as smp
    HAS_SMP = True
except ImportError:
    smp = None
    HAS_SMP = False

LOCAL_FTW_PRUE_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../../models/field_segmentation/ftw-prue")
)
LOCAL_FTW_PRUE_WEIGHTS = os.path.join(LOCAL_FTW_PRUE_DIR, "prue_efnetb3_ccby-b35d59a6.pth")
HF_FTW_REPO_ID = "fieldsoftheworld/ftw-prue-ccby"

LOCAL_FTP_B3_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../../models/field_segmentation/ftp-b3")
)
HF_FTP_REPO_ID = "fieldsoftheworld/ftp-b3"


class FTWPRUESentinel2Model(nn.Module):
    """Fields of the World (FTW-PRUE+) Sentinel-2 Field Boundary Segmentation Model.
    
    Source: https://huggingface.co/fieldsoftheworld/ftw-prue-ccby
    Backbone: EfficientNet-B3
    Decoder: U-Net
    Input Resolution: 10m (Sentinel-2 Native)
    Input Layout: [B04, B03, B02, B08, B04, B03, B02, B08] (Red, Green, Blue, NIR)
    Output Classes: 3 (0: Background, 1: Field Interior, 2: Field Boundary)
    """

    def __init__(
        self,
        weights_path: Optional[str] = None,
        in_channels: int = 8,
        num_classes: int = 3,
        device: Optional[str] = None
    ):
        super().__init__()
        self.in_channels = in_channels
        self.num_classes = num_classes
        self.weights_path = weights_path or LOCAL_FTW_PRUE_WEIGHTS
        self._device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.backbone_name = "efficientnet-b3"
        self.architecture_name = "Fields of the World (FTW-PRUE+) EfficientNet-B3 U-Net (Sentinel-2 10m Native)"

        self.net = self._init_model()

    def _init_model(self) -> nn.Module:
        """Instantiate smp.Unet and load FTW-PRUE+ weights."""
        if not HAS_SMP:
            raise RuntimeError("segmentation_models_pytorch is required for FTW-PRUE model.")

        model = smp.Unet(
            encoder_name=self.backbone_name,
            in_channels=self.in_channels,
            classes=self.num_classes,
            encoder_weights=None
        )

        # 1. Check local checkpoint
        if os.path.exists(self.weights_path):
            try:
                state = torch.load(self.weights_path, map_location=self._device)
                if isinstance(state, dict) and "state_dict" in state:
                    state = {k.replace("model.", ""): v for k, v in state["state_dict"].items()}
                model.load_state_dict(state, strict=False)
                return model
            except Exception:
                pass

        # 2. Check Hugging Face hub cached file
        try:
            from huggingface_hub import hf_hub_download
            p = hf_hub_download(repo_id=HF_FTW_REPO_ID, filename="prue_efnetb3_ccby-b35d59a6.pth")
            state = torch.load(p, map_location=self._device)
            if isinstance(state, dict) and "state_dict" in state:
                state = {k.replace("model.", ""): v for k, v in state["state_dict"].items()}
            model.load_state_dict(state, strict=False)
            return model
        except Exception:
            pass

        return model

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Forward pass expecting (B, 8, H, W) in [B04, B03, B02, B08, B04, B03, B02, B08]."""
        B, C, H, W = x.shape
        if C == 8:
            adapted = x
        elif C == 4:
            # Replicate 4 bands into 8-channel bi-temporal representation
            adapted = torch.cat([x, x], dim=1)
        elif C == 3:
            adapted = torch.cat([x, x, x[:, :2]], dim=1)
        elif C < 8:
            reps = (8 + C - 1) // C
            adapted = x.repeat(1, reps, 1, 1)[:, :8, :, :]
        else:
            adapted = x[:, :8, :, :]

        return self.net(adapted)

    @torch.inference_mode()
    def predict_proba(self, x: torch.Tensor) -> torch.Tensor:
        """Forward pass returning softmax probabilities across classes (B, 3, H, W)."""
        logits = self.forward(x)
        return F.softmax(logits, dim=1)

    def count_parameters(self) -> int:
        return sum(p.numel() for p in self.parameters())


class FTPB3SegmentationModel(nn.Module):
    """Fields of the Planet (FTP-B3) Field Boundary Segmentation Model (PlanetScope 3m Native)."""

    def __init__(
        self,
        model_source: Optional[str] = None,
        in_channels: int = 8,
        num_classes: int = 3,
        device: Optional[str] = None
    ):
        super().__init__()
        self.in_channels = in_channels
        self.num_classes = num_classes
        self.model_source = model_source or LOCAL_FTP_B3_DIR
        self._device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.backbone_name = "efficientnet-b3"
        self.architecture_name = "Fields of the Planet (FTP-B3) EfficientNet-B3 U-Net (PlanetScope 3m Native)"

        self.net = self._init_smp_model()

    def _init_smp_model(self) -> nn.Module:
        if not HAS_SMP:
            raise RuntimeError("segmentation_models_pytorch is required.")

        candidate_paths = [
            self.model_source,
            LOCAL_FTP_B3_DIR,
            os.path.expanduser("~/.cache/huggingface/hub/models--fieldsoftheworld--ftp-b3/snapshots/301701bb04e62b1b55c7d807556a53600e6f386a"),
        ]

        for p in candidate_paths:
            if p and os.path.isdir(p) and (
                os.path.exists(os.path.join(p, "config.json")) or
                os.path.exists(os.path.join(p, "model.safetensors"))
            ):
                try:
                    return smp.from_pretrained(p)
                except Exception:
                    pass

        try:
            return smp.from_pretrained(HF_FTP_REPO_ID)
        except Exception:
            pass

        return smp.Unet(
            encoder_name=self.backbone_name,
            encoder_weights=None,
            in_channels=self.in_channels,
            classes=self.num_classes,
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        B, C, H, W = x.shape
        if C == 8:
            adapted_x = x
        elif C == 4:
            adapted_x = torch.cat([x, x], dim=1)
        elif C == 3:
            adapted_x = torch.cat([x, x, x[:, :2]], dim=1)
        elif C < 8:
            reps = (8 + C - 1) // C
            adapted_x = x.repeat(1, reps, 1, 1)[:, :8, :, :]
        else:
            adapted_x = x[:, :8, :, :]

        return self.net(adapted_x)

    @torch.inference_mode()
    def predict_proba(self, x: torch.Tensor) -> torch.Tensor:
        logits = self.forward(x)
        return F.softmax(logits, dim=1)

    def count_parameters(self) -> int:
        return sum(p.numel() for p in self.parameters())


# Legacy architecture retained for reference and fallback compatibility
class DoubleConv(nn.Module):
    def __init__(self, in_ch: int, out_ch: int):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv2d(in_ch, out_ch, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_ch, out_ch, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class UpBlock(nn.Module):
    def __init__(self, in_ch: int, skip_ch: int, out_ch: int):
        super().__init__()
        self.conv = DoubleConv(in_ch + skip_ch, out_ch)

    def forward(self, x: torch.Tensor, skip: Optional[torch.Tensor] = None) -> torch.Tensor:
        x = F.interpolate(x, scale_factor=2, mode="bilinear", align_corners=True)
        if skip is not None:
            diff_y = skip.size(2) - x.size(2)
            diff_x = skip.size(3) - x.size(3)
            if diff_y != 0 or diff_x != 0:
                x = F.pad(x, [diff_x // 2, diff_x - diff_x // 2, diff_y // 2, diff_y - diff_y // 2])
            x = torch.cat([skip, x], dim=1)
        return self.conv(x)


class UNetMobileNetV3Small(nn.Module):
    def __init__(
        self,
        in_channels: int = 4,
        num_classes: int = 3,
        pretrained_encoder: bool = True,
        weights_path: Optional[str] = None
    ):
        super().__init__()
        import torchvision.models as models
        self.in_channels = in_channels
        self.num_classes = num_classes

        base = models.mobilenet_v3_small(weights=None)
        features = base.features

        orig_conv = features[0][0]
        first_conv = nn.Conv2d(
            in_channels,
            orig_conv.out_channels,
            kernel_size=3,
            stride=2,
            padding=1,
            bias=False
        )
        with torch.no_grad():
            if in_channels >= 3:
                first_conv.weight[:, :3] = orig_conv.weight[:, :3]
            if in_channels >= 4:
                first_conv.weight[:, 3:4] = (orig_conv.weight[:, 0:1] + orig_conv.weight[:, 1:2]) / 2.0

        self.encoder0 = nn.Sequential(first_conv, features[0][1], features[0][2])
        self.encoder1 = nn.Sequential(features[1])
        self.encoder2 = nn.Sequential(features[2], features[3])
        self.encoder3 = nn.Sequential(features[4], features[5], features[6], features[7], features[8])
        self.encoder4 = nn.Sequential(features[9], features[10], features[11], features[12])

        self.up4 = UpBlock(in_ch=576, skip_ch=48, out_ch=96)
        self.up3 = UpBlock(in_ch=96,  skip_ch=24, out_ch=48)
        self.up2 = UpBlock(in_ch=48,  skip_ch=16, out_ch=32)
        self.up1 = UpBlock(in_ch=32,  skip_ch=16, out_ch=24)
        self.up0 = UpBlock(in_ch=24,  skip_ch=0,  out_ch=16)

        self.head = nn.Conv2d(16, num_classes, kernel_size=1)

        if weights_path and os.path.exists(weights_path):
            self.load_checkpoint(weights_path)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        e0 = self.encoder0(x)
        e1 = self.encoder1(e0)
        e2 = self.encoder2(e1)
        e3 = self.encoder3(e2)
        e4 = self.encoder4(e3)

        d4 = self.up4(e4, e3)
        d3 = self.up3(d4, e2)
        d2 = self.up2(d3, e1)
        d1 = self.up1(d2, e0)
        d0 = self.up0(d1)
        return self.head(d0)

    @torch.inference_mode()
    def predict_proba(self, x: torch.Tensor) -> torch.Tensor:
        logits = self.forward(x)
        return F.softmax(logits, dim=1)

    def count_parameters(self) -> int:
        return sum(p.numel() for p in self.parameters() if p.requires_grad)

    def load_checkpoint(self, path: str, device: str = "cpu") -> None:
        checkpoint = torch.load(path, map_location=device)
        if isinstance(checkpoint, dict) and "model_state_dict" in checkpoint:
            self.load_state_dict(checkpoint["model_state_dict"])
        else:
            self.load_state_dict(checkpoint)
