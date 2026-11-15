"""
Statistical processing and agronomic unit conversions for SoilGrids extraction.
Calculates area-weighted means, minimums, maximums, coverage, depth composites,
and USDA soil texture classification.
"""

from typing import Any, Optional
import numpy as np
from app.services.soilgrids.client import SOILGRIDS_VARIABLES
from app.services.soilgrids.extraction import ExtractionResult
from app.services.soilgrids.schemas import SoilMeasurement, TopsoilSummary

def get_usda_texture(sand_pct: float, silt_pct: float, clay_pct: float) -> str:
    """
    Determine the standard USDA Soil Texture Class from sand, silt, and clay percentages.
    Follows the official USDA Soil Texture Triangle classification.
    """
    total = sand_pct + silt_pct + clay_pct
    if total > 0:
        sand = (sand_pct / total) * 100.0
        silt = (silt_pct / total) * 100.0
        clay = (clay_pct / total) * 100.0
    else:
        return "Loam"

    if sand >= 85.0 and (silt + 1.5 * clay) < 15.0:
        return "Sand"
    elif sand >= 70.0 and (silt + 1.5 * clay) >= 15.0 and (silt + 2.0 * clay) <= 30.0:
        return "Loamy Sand"
    elif (clay >= 7.0 and clay < 20.0 and sand > 52.0 and (silt + 2.0 * clay) >= 30.0) or (
        clay < 7.0 and silt < 50.0 and (silt + 2.0 * clay) >= 30.0
    ):
        return "Sandy Loam"
    elif clay >= 7.0 and clay < 27.0 and silt >= 28.0 and silt < 50.0 and sand <= 52.0:
        return "Loam"
    elif (silt >= 50.0 and (clay >= 12.0 and clay < 27.0)) or (silt >= 50.0 and silt < 80.0 and clay < 12.0):
        return "Silt Loam"
    elif silt >= 80.0 and clay < 12.0:
        return "Silt"
    elif clay >= 20.0 and clay < 35.0 and silt < 28.0 and sand > 45.0:
        return "Sandy Clay Loam"
    elif clay >= 27.0 and clay < 40.0 and sand > 20.0 and sand <= 45.0:
        return "Clay Loam"
    elif clay >= 27.0 and clay < 40.0 and sand <= 20.0:
        return "Silty Clay Loam"
    elif clay >= 35.0 and sand >= 45.0:
        return "Sandy Clay"
    elif clay >= 40.0 and silt >= 40.0:
        return "Silty Clay"
    elif clay >= 40.0 and sand <= 45.0 and silt < 40.0:
        return "Clay"
    return "Loam"

class SoilStatisticsProcessor:
    @staticmethod
    def calculate_measurement(result: ExtractionResult) -> Optional[SoilMeasurement]:
        """
        Compute weighted statistical metrics and apply unit conversions for a property and depth.
        """
        if not result.values:
            return None

        vals = np.array(result.values, dtype=np.float64)
        wts = np.array(result.weights, dtype=np.float64)

        if np.sum(wts) <= 0:
            raw_mean = float(np.mean(vals))
        else:
            raw_mean = float(np.sum(vals * wts) / np.sum(wts))

        raw_min = float(np.min(vals))
        raw_max = float(np.max(vals))

        var_meta = SOILGRIDS_VARIABLES.get(result.property_name, {
            "scale_factor": 1.0,
            "conventional_unit": "",
        })
        scale = var_meta.get("scale_factor", 1.0)
        unit = var_meta.get("conventional_unit", "")

        return SoilMeasurement(
            property_name=result.property_name,
            depth_interval=result.depth,
            mean_value=round(raw_mean * scale, 3),
            minimum_value=round(raw_min * scale, 3),
            maximum_value=round(raw_max * scale, 3),
            unit=unit,
            raw_mean=round(raw_mean, 2),
            valid_pixel_count=result.valid_pixel_count,
            coverage_percentage=round(result.coverage_percentage, 1),
        )

    @staticmethod
    def compute_topsoil_summary(
        measurements: list[SoilMeasurement],
        field_area_ha: float,
        is_subpixel: bool = False,
    ) -> Optional[TopsoilSummary]:
        """
        Calculate depth-weighted composite topsoil (0-30cm) properties.
        Depth weights:
        - 0-5cm: 5/30 = 0.1667
        - 5-15cm: 10/30 = 0.3333
        - 15-30cm: 15/30 = 0.5000
        """
        depth_weights = {
            "0-5cm": 5.0 / 30.0,
            "5-15cm": 10.0 / 30.0,
            "15-30cm": 15.0 / 30.0,
        }

        # Group by property
        by_prop: dict[str, dict[str, float]] = {}
        pixel_count = 0

        for m in measurements:
            if m.depth_interval in depth_weights:
                if m.property_name not in by_prop:
                    by_prop[m.property_name] = {}
                by_prop[m.property_name][m.depth_interval] = m.mean_value
                pixel_count = max(pixel_count, m.valid_pixel_count)

        required_properties = {
            "phh2o", "soc", "clay", "sand", "silt", "bdod", "cec", "nitrogen"
        }
        if not required_properties.issubset(by_prop):
            # A complete TopsoilSummary cannot truthfully represent missing
            # SoilGrids properties. The former fixed profile fallback is
            # intentionally disabled; callers receive no summary instead.
            return None

        def weighted_avg(prop: str) -> Optional[float]:
            depth_vals = by_prop[prop]
            total_wt = sum(depth_weights[d] for d in depth_vals if d in depth_weights)
            if total_wt <= 0:
                return None
            return sum(depth_vals[d] * depth_weights[d] for d in depth_vals if d in depth_weights) / total_wt

        ph = weighted_avg("phh2o")
        soc_g_kg = weighted_avg("soc")
        clay = weighted_avg("clay")
        sand = weighted_avg("sand")
        silt = weighted_avg("silt")
        bdod = weighted_avg("bdod")
        cec = weighted_avg("cec")
        nitrogen = weighted_avg("nitrogen")
        if any(value is None for value in (ph, soc_g_kg, clay, sand, silt, bdod, cec, nitrogen)):
            return None
        assert all(value is not None for value in (ph, soc_g_kg, clay, sand, silt, bdod, cec, nitrogen))

        # Texture classification
        texture = get_usda_texture(sand, silt, clay)

        # Resolution limitation note
        resolution_note = None
        if is_subpixel or field_area_ha < 6.25:
            resolution_note = (
                f"Field area ({field_area_ha:.2f} ha) is smaller than the 250m raster resolution (6.25 ha/pixel). "
                f"Values represent modelled SoilGrids grid cell predictions."
            )

        return TopsoilSummary(
            depth_interval="0-30cm",
            ph=round(ph, 2),
            organic_carbon_g_kg=round(soc_g_kg, 2),
            organic_carbon_pct=round(soc_g_kg / 10.0, 2),
            clay_pct=round(clay, 1),
            sand_pct=round(sand, 1),
            silt_pct=round(silt, 1),
            texture_class=texture,
            bulk_density_g_cm3=round(bdod, 2),
            cec_mmol_kg=round(cec, 1),
            total_nitrogen_g_kg=round(nitrogen, 2),
            valid_pixel_count=pixel_count,
            is_subpixel=is_subpixel or field_area_ha < 6.25,
            resolution_limitation=resolution_note,
        )

soil_stats_processor = SoilStatisticsProcessor()
