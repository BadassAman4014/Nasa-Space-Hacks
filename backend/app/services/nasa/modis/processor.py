"""
Temporal processor for NASA MODIS (MOD13Q1) 16-day vegetation index observations.
Calculates seasonal maximum, seasonal mean, and monthly summaries for NDVI and EVI.
"""

from collections import defaultdict
from datetime import datetime
from typing import Any
import numpy as np

class ModisProcessor:
    def calculate_monthly_summaries(self, observations: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Calculate monthly mean NDVI and EVI from 16-day composite observations."""
        months = defaultdict(lambda: {"ndvi": [], "evi": []})
        for obs in observations:
            try:
                dt = datetime.strptime(obs["observation_date"], "%Y-%m-%d")
                m_key = dt.strftime("%Y-%m")
                months[m_key]["ndvi"].append(obs["mean_value"])
                evi_val = obs.get("metadata", {}).get("evi_mean")
                if evi_val is not None:
                    months[m_key]["evi"].append(evi_val)
            except Exception:
                continue

        result = []
        for m_key in sorted(months.keys()):
            ndvis = months[m_key]["ndvi"]
            evis = months[m_key]["evi"]
            result.append({
                "month": m_key,
                "mean_ndvi": round(float(np.mean(ndvis)), 4) if ndvis else None,
                "max_ndvi": round(float(np.max(ndvis)), 4) if ndvis else None,
                "mean_evi": round(float(np.mean(evis)), 4) if evis else None,
                "observation_count": len(ndvis),
            })
        return result

    def calculate_seasonal_metrics(self, observations: list[dict[str, Any]]) -> dict[str, Any]:
        """Calculate seasonal maximum NDVI, seasonal mean NDVI, and mean EVI."""
        if not observations:
            return {
                "seasonal_max_ndvi": None,
                "seasonal_mean_ndvi": None,
                "seasonal_mean_evi": None,
            }

        ndvis = [obs["mean_value"] for obs in observations if "mean_value" in obs]
        evis = [
            obs.get("metadata", {}).get("evi_mean")
            for obs in observations
            if obs.get("metadata", {}).get("evi_mean") is not None
        ]

        return {
            "seasonal_max_ndvi": round(float(np.max(ndvis)), 4) if ndvis else None,
            "seasonal_mean_ndvi": round(float(np.mean(ndvis)), 4) if ndvis else None,
            "seasonal_mean_evi": round(float(np.mean(evis)), 4) if evis else None,
            "observation_count": len(ndvis),
        }

modis_processor = ModisProcessor()

