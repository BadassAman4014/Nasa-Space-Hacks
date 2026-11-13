import torch
import torch.nn as nn
import torch.nn.functional as F
import torchvision.models as models

class DoubleConv(nn.Module):
    def __init__(self, in_ch, out_ch):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv2d(in_ch, out_ch, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_ch, out_ch, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True),
        )

    def forward(self, x):
        return self.net(x)

class UpBlock(nn.Module):
    def __init__(self, in_ch, skip_ch, out_ch):
        super().__init__()
        self.conv = DoubleConv(in_ch + skip_ch, out_ch)

    def forward(self, x, skip=None):
        x = F.interpolate(x, scale_factor=2, mode='bilinear', align_corners=True)
        if skip is not None:
            diff_y = skip.size(2) - x.size(2)
            diff_x = skip.size(3) - x.size(3)
            if diff_y != 0 or diff_x != 0:
                x = F.pad(x, [diff_x // 2, diff_x - diff_x // 2, diff_y // 2, diff_y - diff_y // 2])
            x = torch.cat([skip, x], dim=1)
        return self.conv(x)

class UNetMobileNetV3Small(nn.Module):
    def __init__(self, in_channels: int = 4, num_classes: int = 3, pretrained: bool = False):
        super().__init__()
        self.in_channels = in_channels
        self.num_classes = num_classes
        self.pretrained = pretrained

        base = models.mobilenet_v3_small(weights=None)
        features = base.features

        # Stem adapt to in_channels
        orig_conv = features[0][0]
        first_conv = nn.Conv2d(in_channels, orig_conv.out_channels, kernel_size=3, stride=2, padding=1, bias=False)
        self.encoder0 = nn.Sequential(
            first_conv,
            features[0][1], # BN
            features[0][2], # Activation
        ) # Out: 16 ch, 128x128

        self.encoder1 = nn.Sequential(features[1]) # Out: 16 ch, 64x64
        self.encoder2 = nn.Sequential(features[2], features[3]) # Out: 24 ch, 32x32
        self.encoder3 = nn.Sequential(features[4], features[5], features[6], features[7], features[8]) # Out: 48 ch, 16x16
        self.encoder4 = nn.Sequential(features[9], features[10], features[11], features[12]) # Out: 576 ch, 8x8

        # Decoder
        self.up4 = UpBlock(576, 48, 96)   # 8x8 -> 16x16
        self.up3 = UpBlock(96, 24, 48)    # 16x16 -> 32x32
        self.up2 = UpBlock(48, 16, 32)    # 32x32 -> 64x64
        self.up1 = UpBlock(32, 16, 24)    # 64x64 -> 128x128
        self.up0 = UpBlock(24, 0, 16)     # 128x128 -> 256x256

        self.head = nn.Conv2d(16, num_classes, kernel_size=1)

    def forward(self, x):
        # Encoder
        e0 = self.encoder0(x)  # [B, 16, 128, 128]
        e1 = self.encoder1(e0) # [B, 16, 64, 64]
        e2 = self.encoder2(e1) # [B, 24, 32, 32]
        e3 = self.encoder3(e2) # [B, 48, 16, 16]
        e4 = self.encoder4(e3) # [B, 576, 8, 8]

        # Decoder
        d4 = self.up4(e4, e3)  # [B, 96, 16, 16]
        d3 = self.up3(d4, e2)  # [B, 48, 32, 32]
        d2 = self.up2(d3, e1)  # [B, 32, 64, 64]
        d1 = self.up1(d2, e0)  # [B, 24, 128, 128]
        d0 = self.up0(d1)      # [B, 16, 256, 256]

        logits = self.head(d0) # [B, 3, 256, 256]
        return logits

    def predict_proba(self, x):
        logits = self.forward(x)
        return F.softmax(logits, dim=1)

if __name__ == '__main__':
    model = UNetMobileNetV3Small(in_channels=4, num_classes=3)
    x = torch.randn(2, 4, 256, 256)
    out = model(x)
    proba = model.predict_proba(x)
    params = sum(p.numel() for p in model.parameters())
    print(f"Output shape: {out.shape}")
    print(f"Proba shape: {proba.shape}")
    print(f"Total parameter count: {params:,}")
