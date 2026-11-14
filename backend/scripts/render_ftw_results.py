"""
Generates high-resolution evaluation figures for the FTW-PRUE+ Sentinel-2 (10m) companion model.
Saves figure to conversation artifact directory.
"""

import os
import sys

os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
ARTIFACT_DIR = r"C:\Users\amanr\.gemini\antigravity\brain\dcbfdd6f-3c7f-4377-a094-214527006dc4"
os.environ["MPLCONFIGDIR"] = os.path.join(ARTIFACT_DIR, "mpl")
os.makedirs(os.environ["MPLCONFIGDIR"], exist_ok=True)

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from shapely.geometry import shape

from app.services.field_segmentation.inference import FieldInferenceEngine
from app.services.field_segmentation.satellite_service import Sentinel2AcquisitionService
from app.services.field_segmentation.preprocessing import rasterize_dfbk_polygons
from app.services.field_boundaries.boundary_provider import boundary_provider

# Target AOI: Trebbin Agricultural Cluster, Brandenburg, Germany
BBOX = (13.4512, 52.2748, 13.4812, 52.2948)
OUTPUT_PNG = os.path.join(ARTIFACT_DIR, "ftw_prue_sentinel2_results.png")

def main():
    print(f"[1/4] Fetching Sentinel-2 raster for AOI {BBOX}...")
    sat_service = Sentinel2AcquisitionService()
    s2_data, meta = sat_service.acquire_scene_for_bbox(BBOX, (256, 256))
    print(f"      Raster shape: {s2_data.shape}, Range: [{s2_data.min():.3f}, {s2_data.max():.3f}]")
    print(f"      Source metadata: {meta.get('source', 'Unknown')} ({meta.get('sensor', 'S2')})")

    print("[2/4] Initializing FTW-PRUE+ Sentinel-2 Inference Engine...")
    engine = FieldInferenceEngine.get_instance()
    print(f"      Active model: {engine.active_architecture}")

    print("[3/4] Running inference & extracting field polygons...")
    proba = engine.run_inference_on_raster(s2_data, tile_size=256, overlap=32)
    detected_features = engine.detect_fields(
        image_4band=s2_data,
        bbox=BBOX,
        min_confidence=0.35,
        min_area_ha=0.4
    )
    print(f"      Detected {len(detected_features)} agricultural field polygons.")

    print("[4/4] Rasterizing official DFBK cadastral ground truth...")
    w, s, e, n = BBOX
    dfbk_resp = boundary_provider.dfbk.get_boundaries_in_viewport(w, s, e, n)
    dfbk_geoms = [shape(f["geometry"]) for f in dfbk_resp["features"] if f.get("geometry")]
    print(f"      Retrieved {len(dfbk_geoms)} official DFBK cadastral ground truth parcels.")
    ground_truth_mask = rasterize_dfbk_polygons(dfbk_geoms, BBOX, (256, 256))

    # Prepare visual layers
    # True color RGB (B04, B03, B02) -> s2_data is [B02, B03, B04, B08]
    rgb = np.stack([s2_data[2], s2_data[1], s2_data[0]], axis=-1)
    rgb = np.clip(rgb * 2.8, 0.0, 1.0)

    # Color Infrared (CIR: B08 NIR, B04 Red, B03 Green)
    cir = np.stack([s2_data[3], s2_data[2], s2_data[1]], axis=-1)
    cir = np.clip(cir * 2.2, 0.0, 1.0)

    interior_prob = proba[1]
    boundary_prob = proba[2]

    # Create figure
    fig, axes = plt.subplots(2, 3, figsize=(18, 12), dpi=200)
    fig.suptitle(
        "Fields of the World (FTW-PRUE+) Sentinel-2 Native (10m) Agricultural Field Detection\n"
        f"AOI: Brandenburg Trebbin Cluster ({BBOX[0]:.4f}°E, {BBOX[1]:.4f}°N) • Resolution: 10m Ground Sample Distance",
        fontsize=15, fontweight="bold", y=0.98
    )

    # 1. True Color
    axes[0, 0].imshow(rgb)
    axes[0, 0].set_title("(1) Sentinel-2 L2A True Color (RGB)", fontsize=12, fontweight="bold")
    axes[0, 0].axis("off")

    # 2. Color Infrared
    axes[0, 1].imshow(cir)
    axes[0, 1].set_title("(2) False-Color Infrared (Vegetation Biomass)", fontsize=12, fontweight="bold")
    axes[0, 1].axis("off")

    # 3. Ground Truth Cadastre
    gt_rgb = np.zeros((256, 256, 3))
    gt_rgb[ground_truth_mask == 1] = [0.2, 0.75, 0.35]  # Field interior: green
    gt_rgb[ground_truth_mask == 2] = [0.95, 0.8, 0.1]   # Boundary: yellow
    axes[0, 2].imshow(gt_rgb)
    axes[0, 2].set_title(f"(3) Official DFBK Cadastral Ground Truth ({len(dfbk_geoms)} Parcels)", fontsize=12, fontweight="bold")
    axes[0, 2].axis("off")

    # 4. Interior Probability
    im_int = axes[1, 0].imshow(interior_prob, cmap="YlGn", vmin=0.0, vmax=1.0)
    axes[1, 0].set_title("(4) FTW-PRUE+ Field Interior Confidence", fontsize=12, fontweight="bold")
    axes[1, 0].axis("off")
    plt.colorbar(im_int, ax=axes[1, 0], fraction=0.046, pad=0.04, label="Interior Probability")

    # 5. Boundary Probability
    im_bnd = axes[1, 1].imshow(boundary_prob, cmap="magma", vmin=0.0, vmax=1.0)
    axes[1, 1].set_title("(5) FTW-PRUE+ Field Boundary Confidence", fontsize=12, fontweight="bold")
    axes[1, 1].axis("off")
    plt.colorbar(im_bnd, ax=axes[1, 1], fraction=0.046, pad=0.04, label="Boundary Probability")

    # 6. Detection Overlay on Satellite
    axes[1, 2].imshow(rgb)
    # Overlay ground truth boundaries in white dashed line
    axes[1, 2].contour(ground_truth_mask == 2, levels=[0.5], colors="cyan", linewidths=1.2, linestyles="dashed")
    # Overlay detected interior
    axes[1, 2].contour(interior_prob > 0.35, levels=[0.5], colors="lime", linewidths=1.6)
    axes[1, 2].set_title(f"(6) Detected AI Polygons ({len(detected_features)}) vs Ground Truth", fontsize=12, fontweight="bold")
    axes[1, 2].axis("off")

    # Add legend
    cyan_line = mpatches.Patch(color="cyan", label=f"Official DFBK Cadastre ({len(dfbk_geoms)} parcels)")
    lime_line = mpatches.Patch(color="lime", label=f"FTW-PRUE+ AI Detections ({len(detected_features)} fields)")
    axes[1, 2].legend(handles=[cyan_line, lime_line], loc="lower right", fontsize=9, framealpha=0.9)

    plt.tight_layout()
    plt.subplots_adjust(top=0.92)
    os.makedirs(ARTIFACT_DIR, exist_ok=True)
    plt.savefig(OUTPUT_PNG, dpi=200, bbox_inches="tight")
    plt.close()

    print(f"Successfully generated evaluation figure at:\n{OUTPUT_PNG}")

if __name__ == "__main__":
    main()
