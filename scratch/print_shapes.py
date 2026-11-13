import torch
import torchvision.models as models

m = models.mobilenet_v3_small()
x = torch.randn(1, 3, 256, 256)
for i, layer in enumerate(m.features):
    x = layer(x)
    print(f"Layer {i:2d}: shape = {list(x.shape)}")
