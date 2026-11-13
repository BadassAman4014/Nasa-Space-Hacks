"""Script to train the U-Net MobileNetV3-Small field boundary segmentation model."""

import sys
import os

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.field_segmentation.training import train_field_segmentation

def main():
    epochs = 12
    batch_size = 4
    lr = 2e-4
    print("=" * 60)
    print("FieldShift AI — CNN Field Boundary Segmentation Training")
    print(f"Epochs: {epochs}, Batch size: {batch_size}, Initial LR: {lr}")
    print("=" * 60)

    results = train_field_segmentation(
        epochs=epochs,
        batch_size=batch_size,
        learning_rate=lr,
    )

    print("\nTraining summary:")
    print(f"Best Val Mean IoU: {results['best_val_mean_iou']:.4f}")
    print(f"Held-out Test Mean IoU: {results['test_metrics']['mean_iou']:.4f}")
    print(f"Checkpoint saved to: {results['checkpoint_path']}")

if __name__ == "__main__":
    main()
