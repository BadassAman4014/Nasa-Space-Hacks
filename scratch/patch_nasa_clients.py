"""Replace the NASA POWER / sine-wave stand-ins with real-data implementations."""
from pathlib import Path

ROOT = Path("backend/app/services/nasa")

BODIES = {
    "smap/client.py": ("def fetch_open_smap_daily", "smap_client = SmapClient()", '''def fetch_open_smap_daily(
        self,
        lat: float,
        lon: float,
        start_date: str,
        end_date: str,
    ) -> list[dict[str, Any]]:
        """
        Real SMAP L3 Enhanced (SPL3SMP_E.006) surface soil moisture for the 9 km cell
        containing the point, extracted by NASA AppEEARS. Only retrievals flagged
        "recommended quality" are returned. If AppEEARS has not finished yet, a task is
        queued and whatever is already cached is returned (possibly nothing).
        """
        from app.services.nasa.real import series

        series.ensure_point_data(lat, lon, start_date, end_date)
        by_day: dict[str, list[dict[str, Any]]] = {}
        for row in series.smap_measured(lat, lon, start_date, end_date):
            if row["used"]:
                by_day.setdefault(row["date"], []).append(row)
        obs_list = []
        for iso_date, passes in sorted(by_day.items()):
            values = [p["value_m3m3"] for p in passes]
            obs_list.append({
                "observation_date": iso_date,
                "period_start": f"{iso_date}T00:00:00Z",
                "period_end": f"{iso_date}T23:59:59Z",
                "mean_value": round(sum(values) / len(values), 4),
                "minimum_value": min(values),
                "maximum_value": max(values),
                "unit": "m³/m³",
                "valid_pixel_count": len(values),
                "coverage_percentage": 100.0,
                "quality_status": "recommended",
                "source_granule": passes[0]["source_ref"] + " (" + ", ".join(p["pass"] for p in passes) + ")",
            })
        return obs_list

'''),
    "gpm/client.py": ("def fetch_open_gpm_daily", "gpm_client = GpmClient()", '''def fetch_open_gpm_daily(
        self,
        lat: float,
        lon: float,
        start_date: str,
        end_date: str,
    ) -> list[dict[str, Any]]:
        """
        Real GPM IMERG Late Run daily precipitation (GPM_3IMERGDL.07) for the 0.1° cell
        containing the point, read as a one-cell subset from NASA cloud OPeNDAP.
        """
        from app.services.nasa.real.imerg import ImergUnavailable, daily_precipitation

        try:
            series = daily_precipitation(lat, lon, start_date, end_date)
        except ImergUnavailable:
            return []
        obs_list = []
        for d in series["days"]:
            if d["precip_mm"] is None:
                continue
            iso_date = d["date"]
            obs_list.append({
                "observation_date": iso_date,
                "period_start": f"{iso_date}T00:00:00Z",
                "period_end": f"{iso_date}T23:59:59Z",
                "mean_value": d["precip_mm"],
                "minimum_value": d["precip_mm"],
                "maximum_value": d["precip_mm"],
                "unit": "mm",
                "valid_pixel_count": 1,
                "coverage_percentage": 100.0,
                "quality_status": "satellite estimate (IMERG Late, not gauge-corrected)",
                "source_granule": d["granule"],
            })
        return obs_list

'''),
    "modis/client.py": ("def fetch_open_modis_composites", "modis_client = ModisClient()", '''def fetch_open_modis_composites(
        self,
        lat: float,
        lon: float,
        start_date: str,
        end_date: str,
    ) -> list[dict[str, Any]]:
        """
        Real MODIS MOD13Q1.061 16-day NDVI at 250 m for the pixel containing the point,
        extracted by NASA AppEEARS together with the SMAP request. Composites with
        pixel reliability worse than "marginal" are dropped.
        """
        from app.services.nasa.real import series

        series.ensure_point_data(lat, lon, start_date, end_date)
        composites = []
        for row in series.modis_ndvi(lat, lon, start_date, end_date):
            if not row["used"]:
                continue
            iso_date = row["date"]
            composites.append({
                "observation_date": iso_date,
                "period_start": f"{iso_date}T00:00:00Z",
                "period_end": f"{iso_date}T23:59:59Z",
                "mean_value": row["ndvi"],
                "minimum_value": row["ndvi"],
                "maximum_value": row["ndvi"],
                "unit": "index (-0.2 to 1.0)",
                "valid_pixel_count": 1,
                "coverage_percentage": 100.0,
                "quality_status": "good" if row["reliability"] == 0 else "marginal",
                "source_granule": row["source_ref"],
                "metadata": {"product": "MOD13Q1.061", "pixel_reliability": row["reliability"]},
            })
        return composites

'''),
}

for rel, (start_marker, end_marker, body) in BODIES.items():
    p = ROOT / rel
    s = p.read_text(encoding="utf-8")
    i = s.index("    " + start_marker)
    j = s.index(end_marker)
    s = s[:i] + "    " + body + s[j:]
    p.write_text(s, encoding="utf-8", newline="\n")
    print("patched", rel)
