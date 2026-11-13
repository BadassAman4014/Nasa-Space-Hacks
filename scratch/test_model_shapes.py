import torch
import torch.nn as nn
import torch.nn.functional as F
import torchvision.models as models

class ConvBlock(nn.Module):
    def __init__(self, in_ch, out_ch):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv2d(in_ch, out_ch, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_ch, out_ch, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True),
        )

    def forward(self, x):
        return self.conv(x)

class UpBlock(nn.Module):
    def __init__(self, in_ch, skip_ch, out_ch):
        super().__init__()
        self.up = nn.Upsample(scale_factor=2, mode='bilinear', align_corners=True)
        self.conv = ConvBlock(in_ch + skip_ch, out_ch)

    def forward(self, x, skip=None):
        x = self.up(x)
        if skip is not None:
            # Handle slight padding differences
            diff_y = skip.size(2) - x.size(2)
            diff_x = skip.size(3) - x.size(3)
            if diff_y != 0 or diff_x != 0:
                x = F.pad(x, [diff_x // 2, diff_x - diff_x // 2, diff_y // 2, diff_y - diff_y // 2])
            x = torch.cat([skip, x], dim=1)
        return self.conv(x)

class UNetMobileNetV3Small(nn.Module):
    def __init__(self, in_channels=4, num_classes=3, pretrained=True):
        super().__init__()
        self.in_channels = in_channels
        self.num_classes = num_classes
        self.pretrained = pretrained

        # Load MobileNetV3-Small
        weights = models.MobileNet_V3_Small_Weights.DEFAULT if pretrained else None
        base = models.mobilenet_v3_small(weights=weights)

        # Stage 0: stem (conv 3x3 s2) + block 0 (16 channels, 128x128)
        # Adapt first conv to in_channels (e.g. 4 for B2, B3, B4, B8)
        orig_conv = base.features[0][0]
        self.stem = nn.Sequential(
            nn.Conv2d(in_channels, orig_conv.out_channels, kernel_size=3, stride=2, padding=1, bias=False),
            base.features[0][1], # BatchNorm
            base.features[0][2], # Hardswish
            base.features[1],    # InvertedResidual (16 ch)
        )
        if pretrained and in_channels >= 3:
            with torch.no_grad():
                self.stem[0].weight[:, :3] = orig_conv.weight
                if in_channels > 3:
                    # Initialize NIR channel (B8) with average of RGB or Red band
                    self.stem[0].weight[:, 3:] = orig_conv.weight[:, 0:1]

        # Stage 1: stride 2 -> 64x64, 24 ch
        self.stage1 = nn.Sequential(base.features[2], base.features[3])

        # Stage 2: stride 2 -> 32x32, 40 ch
        self.stage2 = nn.Sequential(base.features[4], base.features[5], base.features[6])

        # Stage 3: stride 2 -> 16x16, 48 ch
        # Note: base.features[7:9] have stride 1, but features[9] has stride 2
        self.stage3 = nn.Sequential(base.features[7], base.features[8])

        # Stage 4: stride 2 -> 8x8, 96 ch
        self.stage4 = nn.Sequential(base.features[9], base.features[10], base.features[11], base.features[12])

        # Decoder with skip connections
        # stage4 out: 576 ch (at 8x8 if 256x256 input)
        # stage3 out: 48 ch (at 32x32) -> let's inspect actual shapes!
        
print("Model test script written")
