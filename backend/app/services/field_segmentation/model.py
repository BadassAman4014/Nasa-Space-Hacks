"""U-Net with MobileNetV3-Small Encoder for Agricultural Field Boundary Segmentation.

Architecture:
- Encoder: MobileNetV3-Small with adapted 4-channel input (B02, B03, B04, B08).
- Decoder: U-Net feature upsampling with bilinear interpolation, skip connections, and DoubleConv blocks.
- Output: 3-channel pixel-wise probability maps (0: Background, 1: Field Interior, 2: Field Boundary).
"""

from typing import Optional, Tuple
import os
import torch
import torch.nn as nn
import torch.nn.functional as F
import torchvision.models as models

class DoubleConv(nn.Module):
    """Two Conv2D-BatchNorm-ReLU layers with residual-friendly layout."""

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
    """Bilinear upsampling block followed by skip-connection concatenation and DoubleConv."""

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
    """Agricultural field segmentation network using MobileNetV3-Small backbone."""

    def __init__(
        self,
        in_channels: int = 4,
        num_classes: int = 3,
        pretrained_encoder: bool = True,
        weights_path: Optional[str] = None
    ):
        super().__init__()
        self.in_channels = in_channels
        self.num_classes = num_classes
        self.pretrained_encoder = pretrained_encoder

        # Load MobileNetV3-Small backbone
        base = models.mobilenet_v3_small(weights=None)
        features = base.features

        # Pretrained backbone loading if requested
        if pretrained_encoder:
            try:
                hub_cache = os.path.expanduser("~/.cache/torch/hub/checkpoints/mobilenet_v3_small-047dcff4.pth")
                if os.path.exists(hub_cache):
                    state_dict = torch.load(hub_cache, map_location="cpu")
                    base.load_state_dict(state_dict)
                else:
                    weights = models.MobileNet_V3_Small_Weights.DEFAULT
                    base = models.mobilenet_v3_small(weights=weights)
                    features = base.features
            except Exception:
                pass  # Fall back to random init if offline/unavailable

        # Adapt first conv layer for 4 channels (B02 Blue, B03 Green, B04 Red, B08 NIR)
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
                # Initialize Near-Infrared (B8) channel with average of Red and Green weights
                first_conv.weight[:, 3:4] = (orig_conv.weight[:, 0:1] + orig_conv.weight[:, 1:2]) / 2.0

        # Encoder stages with hierarchical feature map resolutions
        self.encoder0 = nn.Sequential(first_conv, features[0][1], features[0][2])  # 1/2 resolution (16 ch)
        self.encoder1 = nn.Sequential(features[1])                                  # 1/4 resolution (16 ch)
        self.encoder2 = nn.Sequential(features[2], features[3])                    # 1/8 resolution (24 ch)
        self.encoder3 = nn.Sequential(features[4], features[5], features[6], features[7], features[8])  # 1/16 resolution (48 ch)
        self.encoder4 = nn.Sequential(features[9], features[10], features[11], features[12])            # 1/32 resolution (576 ch bottleneck)

        # U-Net decoder with multi-scale skip connections
        self.up4 = UpBlock(in_ch=576, skip_ch=48, out_ch=96)  # 1/32 -> 1/16
        self.up3 = UpBlock(in_ch=96,  skip_ch=24, out_ch=48)  # 1/16 -> 1/8
        self.up2 = UpBlock(in_ch=48,  skip_ch=16, out_ch=32)  # 1/8  -> 1/4
        self.up1 = UpBlock(in_ch=32,  skip_ch=16, out_ch=24)  # 1/4  -> 1/2
        self.up0 = UpBlock(in_ch=24,  skip_ch=0,  out_ch=16)  # 1/2  -> 1/1 (full input res)

        # Final 1x1 classification head
        self.head = nn.Conv2d(16, num_classes, kernel_size=1)

        # If a full custom checkpoint was provided, load it
        if weights_path and os.path.exists(weights_path):
            self.load_checkpoint(weights_path)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Forward pass returning unnormalized logits of shape (B, num_classes, H, W)."""
        # Encoder passes
        e0 = self.encoder0(x)  # [B, 16, H/2, W/2]
        e1 = self.encoder1(e0) # [B, 16, H/4, W/4]
        e2 = self.encoder2(e1) # [B, 24, H/8, W/8]
        e3 = self.encoder3(e2) # [B, 48, H/16, W/16]
        e4 = self.encoder4(e3) # [B, 576, H/32, W/32]

        # Decoder passes with skip connections
        d4 = self.up4(e4, e3)  # [B, 96, H/16, W/16]
        d3 = self.up3(d4, e2)  # [B, 48, H/8, W/8]
        d2 = self.up2(d3, e1)  # [B, 32, H/4, W/4]
        d1 = self.up1(d2, e0)  # [B, 24, H/2, W/2]
        d0 = self.up0(d1)      # [B, 16, H, W]

        logits = self.head(d0) # [B, 3, H, W]
        return logits

    @torch.inference_mode()
    def predict_proba(self, x: torch.Tensor) -> torch.Tensor:
        """Forward pass returning softmax probabilities across classes (B, 3, H, W)."""
        logits = self.forward(x)
        return F.softmax(logits, dim=1)

    def count_parameters(self) -> int:
        """Return total trainable parameters count."""
        return sum(p.numel() for p in self.parameters() if p.requires_grad)

    def save_checkpoint(self, path: str, extra_meta: Optional[dict] = None) -> None:
        """Save model weights and metadata."""
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        payload = {
            "model_state_dict": self.state_dict(),
            "in_channels": self.in_channels,
            "num_classes": self.num_classes,
            "architecture": "U-Net MobileNetV3-Small",
            "parameters": self.count_parameters(),
            "metadata": extra_meta or {},
        }
        torch.save(payload, path)

    def load_checkpoint(self, path: str, device: str = "cpu") -> None:
        """Load state dict from a checkpoint file."""
        checkpoint = torch.load(path, map_location=device)
        if isinstance(checkpoint, dict) and "model_state_dict" in checkpoint:
            self.load_state_dict(checkpoint["model_state_dict"])
        else:
            self.load_state_dict(checkpoint)
