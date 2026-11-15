"""Training Pipeline, Evaluation Metrics, and Model Checkpointing for Field Segmentation."""

from typing import Any, Dict, Optional, Tuple
import os
import json
import time
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader

from .model import UNetMobileNetV3Small
from .dataset import FieldSegmentationDataset
from .preprocessing import DEFAULT_NORMALIZATION

MODEL_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../models/field_segmentation"))
os.makedirs(MODEL_DIR, exist_ok=True)

class DiceLoss(nn.Module):
    """Multi-class Dice loss for semantic segmentation with smoothing."""

    def __init__(self, smooth: float = 1.0, ignore_index: Optional[int] = None):
        super().__init__()
        self.smooth = smooth
        self.ignore_index = ignore_index

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        num_classes = logits.shape[1]
        probs = F.softmax(logits, dim=1)

        # One-hot encode targets: (B, H, W) -> (B, num_classes, H, W)
        targets_one_hot = F.one_hot(targets, num_classes=num_classes).permute(0, 3, 1, 2).float()

        dice_per_class = []
        for c in range(num_classes):
            if c == self.ignore_index:
                continue
            pred_c = probs[:, c].contiguous().view(-1)
            target_c = targets_one_hot[:, c].contiguous().view(-1)
            intersection = (pred_c * target_c).sum()
            union = pred_c.sum() + target_c.sum()
            dice = (2.0 * intersection + self.smooth) / (union + self.smooth)
            dice_per_class.append(1.0 - dice)

        return torch.stack(dice_per_class).mean()

class CombinedLoss(nn.Module):
    """Weighted sum of Cross-Entropy and Dice Loss with boundary reweighting."""

    def __init__(self, class_weights: Optional[torch.Tensor] = None):
        super().__init__()
        self.ce = nn.CrossEntropyLoss(weight=class_weights)
        self.dice = DiceLoss()

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        return self.ce(logits, targets) + self.dice(logits, targets)

def compute_segmentation_metrics(
    preds: np.ndarray,
    targets: np.ndarray,
    num_classes: int = 3
) -> Dict[str, float]:
    """Compute per-class IoU, Mean IoU, Precision, Recall, and F1."""
    iou_list = []
    f1_list = []
    class_names = ["background", "field_interior", "field_boundary"]

    metrics = {}

    for c in range(num_classes):
        pred_c = (preds == c)
        target_c = (targets == c)

        tp = np.count_nonzero(pred_c & target_c)
        fp = np.count_nonzero(pred_c & ~target_c)
        fn = np.count_nonzero(~pred_c & target_c)

        union = tp + fp + fn
        iou = tp / union if union > 0 else 1.0
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = (2 * precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0

        c_name = class_names[c]
        metrics[f"iou_{c_name}"] = round(float(iou), 4)
        metrics[f"precision_{c_name}"] = round(float(precision), 4)
        metrics[f"recall_{c_name}"] = round(float(recall), 4)
        metrics[f"f1_{c_name}"] = round(float(f1), 4)

        iou_list.append(iou)
        f1_list.append(f1)

    metrics["mean_iou"] = round(float(np.mean(iou_list)), 4)
    metrics["mean_f1"] = round(float(np.mean(f1_list)), 4)
    metrics["boundary_f1"] = metrics["f1_field_boundary"]
    return metrics

def train_field_segmentation(
    epochs: int = 15,
    batch_size: int = 4,
    learning_rate: float = 2e-4,
    weight_decay: float = 1e-4,
    output_dir: str = MODEL_DIR,
    device: Optional[str] = None
) -> Dict[str, Any]:
    """Execute training run and save checkpoints and evaluation artifacts."""
    device = device or ("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Starting Field Boundary CNN Training on device: {device}")

    # Build datasets with geographic separation
    train_ds = FieldSegmentationDataset(split="train", samples_per_split=48, augment=True)
    val_ds = FieldSegmentationDataset(split="val", samples_per_split=16, augment=False)
    test_ds = FieldSegmentationDataset(split="test", samples_per_split=16, augment=False)

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False)
    test_loader = DataLoader(test_ds, batch_size=batch_size, shuffle=False)

    # Initialize model with MobileNetV3-Small backbone
    model = UNetMobileNetV3Small(in_channels=4, num_classes=3, pretrained_encoder=True)
    model.to(device)

    # Class weights to balance sparse boundary pixels
    # 0: Background (0.8), 1: Field Interior (1.0), 2: Field Boundary (2.5)
    class_weights = torch.tensor([0.8, 1.0, 2.5], device=device)
    criterion = CombinedLoss(class_weights=class_weights)

    optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate, weight_decay=weight_decay)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs, eta_min=1e-6)

    best_val_miou = 0.0
    history = []
    start_time = time.time()

    for epoch in range(1, epochs + 1):
        # Training phase
        model.train()
        train_loss = 0.0
        for imgs, masks in train_loader:
            imgs = imgs.to(device)
            masks = masks.to(device)

            optimizer.zero_grad()
            logits = model(imgs)
            loss = criterion(logits, masks)
            loss.backward()
            optimizer.step()
            train_loss += loss.item()

        scheduler.step()
        train_loss /= len(train_loader)

        # Validation phase
        model.eval()
        val_loss = 0.0
        all_preds = []
        all_targets = []

        with torch.no_grad():
            for imgs, masks in val_loader:
                imgs = imgs.to(device)
                masks = masks.to(device)
                logits = model(imgs)
                loss = criterion(logits, masks)
                val_loss += loss.item()

                preds = torch.argmax(logits, dim=1).cpu().numpy()
                all_preds.append(preds)
                all_targets.append(masks.cpu().numpy())

        val_loss /= len(val_loader)
        all_preds = np.concatenate(all_preds, axis=0)
        all_targets = np.concatenate(all_targets, axis=0)
        val_metrics = compute_segmentation_metrics(all_preds, all_targets)

        print(
            f"Epoch {epoch:2d}/{epochs:2d} | "
            f"Train Loss: {train_loss:.4f} | "
            f"Val Loss: {val_loss:.4f} | "
            f"mIoU: {val_metrics['mean_iou']:.4f} | "
            f"Boundary F1: {val_metrics['boundary_f1']:.4f}"
        )

        epoch_record = {
            "epoch": epoch,
            "train_loss": round(train_loss, 4),
            "val_loss": round(val_loss, 4),
            **val_metrics
        }
        history.append(epoch_record)

        # Checkpoint saving
        last_ckpt = os.path.join(output_dir, "last_model.pth")
        model.save_checkpoint(last_ckpt, extra_meta=epoch_record)

        if val_metrics["mean_iou"] > best_val_miou:
            best_val_miou = val_metrics["mean_iou"]
            best_ckpt = os.path.join(output_dir, "best_model.pth")
            model.save_checkpoint(best_ckpt, extra_meta=epoch_record)

    # Held-out Test evaluation
    model.eval()
    test_preds, test_targets = [], []
    with torch.no_grad():
        for imgs, masks in test_loader:
            imgs = imgs.to(device)
            logits = model(imgs)
            preds = torch.argmax(logits, dim=1).cpu().numpy()
            test_preds.append(preds)
            test_targets.append(masks.numpy())

    test_preds = np.concatenate(test_preds, axis=0)
    test_targets = np.concatenate(test_targets, axis=0)
    test_metrics = compute_segmentation_metrics(test_preds, test_targets)

    duration_s = time.time() - start_time
    print(f"Training completed in {duration_s:.1f}s. Best Val mIoU: {best_val_miou:.4f}, Test mIoU: {test_metrics['mean_iou']:.4f}")

    # Save metadata files
    # 1. config.json
    config_data = {
        "model_architecture": "U-Net MobileNetV3-Small",
        "parameters_count": model.count_parameters(),
        "input_bands": ["B02", "B03", "B04", "B08"],
        "input_resolution_meters": 10.0,
        "patch_size": 256,
        "epochs": epochs,
        "batch_size": batch_size,
        "initial_learning_rate": learning_rate,
        "optimizer": "AdamW",
        "loss": "CrossEntropy + Dice",
        "class_weights": [0.8, 1.0, 2.5],
        "pretrained_encoder": "ImageNet1k (MobileNetV3-Small)",
        "training_duration_seconds": round(duration_s, 2),
    }
    with open(os.path.join(output_dir, "config.json"), "w", encoding="utf-8") as f:
        json.dump(config_data, f, indent=2)

    # 2. metrics.json
    metrics_data = {
        "best_val_mean_iou": round(best_val_miou, 4),
        "validation_metrics": history[-1] if history else {},
        "held_out_test_metrics": test_metrics,
        "epochs_history": history,
    }
    with open(os.path.join(output_dir, "metrics.json"), "w", encoding="utf-8") as f:
        json.dump(metrics_data, f, indent=2)

    # 3. normalization.json
    with open(os.path.join(output_dir, "normalization.json"), "w", encoding="utf-8") as f:
        json.dump(DEFAULT_NORMALIZATION, f, indent=2)

    # 4. class_mapping.json
    class_mapping = {
        "0": {"name": "background", "description": "Non-agricultural/built-up/water/forest"},
        "1": {"name": "field_interior", "description": "Agricultural cropland or pasture interior"},
        "2": {"name": "field_boundary", "description": "Border, margin, hedgerow, or track separating fields"}
    }
    with open(os.path.join(output_dir, "class_mapping.json"), "w", encoding="utf-8") as f:
        json.dump(class_mapping, f, indent=2)

    # 5. model_card.md
    model_card = f"""# Farmily — Agricultural Field Boundary Segmentation Model Card

## Model Overview
- **Architecture**: U-Net with MobileNetV3-Small Encoder
- **Parameters**: {model.count_parameters():,} trainable parameters
- **Input Channels**: 4 (Sentinel-2 L2A: B02 Blue, B03 Green, B04 Red, B08 NIR)
- **Spatial Resolution**: 10 meters per pixel
- **Classes**:
  - Class 0: Background
  - Class 1: Field Interior
  - Class 2: Field Boundary

## Training Details
- **Training Region**: Central-South Brandenburg (Potsdam, Teltow-Fläming, Dahme-Spreewald)
- **Validation Region**: Western Brandenburg (Havelland, Rathenow) — Geographically separate
- **Held-Out Test Region**: Northern-Eastern Brandenburg (Barnim, Uckermark) — Unseen geographic test
- **Ground Truth Reference**: Digitales Feldblockkataster Brandenburg (DFBK) 2026 Reference Polygons
- **Loss Function**: Combined Cross-Entropy (reweighted boundary 2.5x) + Multi-class Dice Loss
- **Optimizer**: AdamW (lr={learning_rate}, weight_decay={weight_decay}) with Cosine Annealing

## Performance Metrics
- **Best Validation Mean IoU**: {best_val_miou:.4f}
- **Validation Interior IoU**: {history[-1].get('iou_field_interior', 0):.4f}
- **Validation Boundary F1**: {history[-1].get('boundary_f1', 0):.4f}
- **Held-Out Test Mean IoU**: {test_metrics['mean_iou']:.4f}
- **Held-Out Test Boundary F1**: {test_metrics['boundary_f1']:.4f}

## Geographic Limitations & Generalization
- **Brandenburg**: High fidelity to official agricultural boundary structures.
- **Outside Brandenburg**: Model predictions are experimental. For regions with distinct field geometry or soil types (e.g. Vertisols in Umred, Maharashtra, India), boundaries must be reviewed and confirmed by the user before being saved.
"""
    with open(os.path.join(output_dir, "model_card.md"), "w", encoding="utf-8") as f:
        f.write(model_card)

    return {
        "best_val_mean_iou": best_val_miou,
        "test_metrics": test_metrics,
        "checkpoint_path": os.path.join(output_dir, "best_model.pth"),
        "config": config_data,
    }
