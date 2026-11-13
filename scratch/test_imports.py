import sys
print("Python:", sys.version)
import torch
print("PyTorch version:", torch.__version__)
import torchvision
print("Torchvision version:", torchvision.__version__)
import rasterio
print("Rasterio version:", rasterio.__version__)
import affine
print("Affine version:", affine.__version__)
print("CUDA Available:", torch.cuda.is_available())
