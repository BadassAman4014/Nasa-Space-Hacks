"""
Temporal processor for NASA GPM IMERG precipitation observations.
Calculates monthly and seasonal accumulated rainfall, rainy-day counts, and heavy rain events.
"""

from collections import defaultdict
from datetime import datetime
from typing import Any
import numpy as np

# Thresholds for agricultural precipitation classification
RAINY_DAY_THRESHOLD_MM = 1.0       # > 1.0 mm qualifies as a measurable rainy day
HEAVY_RAIN_THRESHOLD_MM = 20.0     # > 20.0 mm qualifies as an intense/heavy rainfall event

class GpmProcessor:
    def calculate_monthly_accumulation(self, observations: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Calculate monthly sum of daily rainfall accumulation (mm)."""
        months = defaultdict(list)
        for obs in observations:
            try:
                dt = datetime.strptime(obs["observation_date"], "%Y-%m-%d")
                month_key = dt.strftime("%Y-%m")
                months[month_key].append(obs["mean_value"])
            except Exception:
                continue

        result = []
        for month_key in sorted(months.keys()):
            vals = months[month_key]
            total_mm = float(np.sum(vals))
            rainy_days = sum(1 for v in vals if v >= RAINY_DAY_THRESHOLD_MM)
            heavy_events = sum(1 for v in vals if v >= HEAVY_RAIN_THRESHOLD_MM)
            result.append({
                "month": month_key,
                "accumulated_precipitation_mm": round(total_mm, 2),
                "rainy_days": rainy_days,
                "heavy_rain_events": heavy_events,
                "days_recorded": len(vals),
                "unit": "mm",
            })
        return result

    def calculate_summary_metrics(self, observations: list[dict[str, Any]]) -> dict[str, Any]:
        """Calculate overall seasonal accumulation and event counts."""
        if not observations:
            return {
                "total_accumulation_mm": 0.0,
                "rainy_days_count": 0,
                "heavy_rain_events_count": 0,
            }

        vals = [obs["mean_value"] for obs in observations if "mean_value" in obs]
        total_mm = float(np.sum(vals)) if vals else 0.0
        rainy_days = sum(1 for v in vals if v >= RAINY_DAY_THRESHOLD_MM)
        heavy_rain = sum(1 for v in vals if v >= HEAVY_RAIN_THRESHOLD_MM)

        return {
            "total_accumulation_mm": round(total_mm, 2),
            "rainy_days_count": rainy_days,
            "heavy_rain_events_count": heavy_rain,
            "unit": "mm",
        }

gpm_processor = GpmProcessor()

