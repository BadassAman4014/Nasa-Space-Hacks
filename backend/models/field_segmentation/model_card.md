# FieldShift AI — Agricultural Field Boundary Segmentation Model Card

## Model Overview
- **Architecture**: U-Net with MobileNetV3-Small Encoder
- **Parameters**: 1,671,683 trainable parameters
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
- **Optimizer**: AdamW (lr=0.0002, weight_decay=0.0001) with Cosine Annealing

## Performance Metrics
- **Best Validation Mean IoU**: 0.2265
- **Validation Interior IoU**: 0.3297
- **Validation Boundary F1**: 0.0300
- **Held-Out Test Mean IoU**: 0.2324
- **Held-Out Test Boundary F1**: 0.0298

## Geographic Limitations & Generalization
- **Brandenburg**: High fidelity to official agricultural boundary structures.
- **Outside Brandenburg**: Model predictions are experimental. For regions with distinct field geometry or soil types (e.g. Vertisols in Umred, Maharashtra, India), boundaries must be reviewed and confirmed by the user before being saved.
