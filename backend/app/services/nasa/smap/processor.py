"""
Temporal processor for NASA SMAP soil moisture observations.
Calculates weekly means, monthly means, and seasonal aggregations.
"""

from collections import defaultdict
from datetime import datetime
from typing import Any
import numpy as np

SEASONS = {
    12: "Winter", 1: "Winter", 2: "Winter",
    3: "Spring", 4: "Spring", 5: "Spring",
    6: "Summer", 7: "Summer", 8: "Summer",
    9: "Autumn", 10: "Autumn", 11: "Autumn",
}

class SmapProcessor:
    def calculate_weekly_means(self, observations: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Calculate ISO calendar week averages of soil moisture."""
        weeks = defaultdict(list)
        for obs in observations:
            try:
                dt = datetime.strptime(obs["observation_date"], "%Y-%m-%d")
                year, week, _ = dt.isocalendar()
                week_key = f"{year}-W{week:02d}"
                weeks[week_key].append(obs["mean_value"])
            except Exception:
                continue

        result = []
        for week_key in sorted(weeks.keys()):
            vals = weeks[week_key]
            result.append({
                "period": week_key,
                "mean_soil_moisture": round(float(np.mean(vals)), 4),
                "count": len(vals),
                "unit": "m³/m³",
            })
        return result

    def calculate_monthly_means(self, observations: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Calculate monthly averages of soil moisture."""
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
            result.append({
                "month": month_key,
                "mean_soil_moisture": round(float(np.mean(vals)), 4),
                "min": round(float(np.min(vals)), 4),
                "max": round(float(np.max(vals)), 4),
                "count": len(vals),
                "unit": "m³/m³",
            })
        return result

    def calculate_seasonal_mean(self, observations: list[dict[str, Any]]) -> dict[str, Any]:
        """Calculate seasonal mean across observations."""
        if not observations:
            return {}
        vals = [obs["mean_value"] for obs in observations if "mean_value" in obs]
        if not vals:
            return {}
        return {
            "seasonal_mean": round(float(np.mean(vals)), 4),
            "unit": "m³/m³",
            "observation_count": len(vals),
        }

smap_processor = SmapProcessor()

