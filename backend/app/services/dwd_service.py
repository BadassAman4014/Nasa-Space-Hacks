"""
DWD (Deutscher Wetterdienst) official weather warnings.

Sources (no API key required):
- Warnings: https://www.dwd.de/DWD/warnungen/warnapp/json/warnings.json
  (JSONP, keyed by WARNCELLID of the Kreis / Stadt)
- Warn-area lookup: DWD GeoServer WFS layer ``dwd:Warngebiete_Kreise``
  (point-in-polygon on the field centroid)

Nothing is synthesised: if DWD cannot be reached or the point is outside
Germany, ``get_alerts_for_point`` returns ``available=False`` with a reason.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import json
import threading
import time

import requests

WARNINGS_URL = "https://www.dwd.de/DWD/warnungen/warnapp/json/warnings.json"
WFS_URL = "https://maps.dwd.de/geoserver/dwd/ows"
ATTRIBUTION = "Deutscher Wetterdienst (DWD)"

WARNINGS_TTL_S = 300
CELL_TTL_S = 30 * 24 * 3600

# Rough bounding box of Germany; avoids useless WFS calls for fields abroad.
_DE_BBOX = (5.5, 47.0, 15.6, 55.2)  # min_lon, min_lat, max_lon, max_lat

# DWD event name -> (category, English label, relevant for farming)
_EVENT_MAP = {
    "FROST": ("frost", "Frost"),
    "STARKER FROST": ("frost", "Severe frost"),
    "EXTREMER FROST": ("frost", "Extreme frost"),
    "GLÄTTE": ("ice", "Ice / slippery roads"),
    "GLATTEIS": ("ice", "Freezing rain / black ice"),
    "WINDBÖEN": ("wind", "Wind gusts"),
    "STURMBÖEN": ("wind", "Storm gusts"),
    "SCHWERE STURMBÖEN": ("wind", "Severe storm gusts"),
    "ORKANARTIGE BÖEN": ("wind", "Hurricane-force gusts"),
    "EXTREME ORKANBÖEN": ("wind", "Extreme hurricane gusts"),
    "STARKREGEN": ("rain", "Heavy rain"),
    "ERGIEBIGER REGEN": ("rain", "Persistent heavy rain"),
    "DAUERREGEN": ("rain", "Continuous rain"),
    "GEWITTER": ("thunderstorm", "Thunderstorm"),
    "STARKES GEWITTER": ("thunderstorm", "Strong thunderstorm"),
    "SCHWERES GEWITTER": ("thunderstorm", "Severe thunderstorm"),
    "EXTREMES GEWITTER": ("thunderstorm", "Extreme thunderstorm"),
    "HAGEL": ("hail", "Hail"),
    "SCHNEEFALL": ("snow", "Snowfall"),
    "STARKER SCHNEEFALL": ("snow", "Heavy snowfall"),
    "SCHNEEVERWEHUNG": ("snow", "Drifting snow"),
    "TAUWETTER": ("thaw", "Thaw / snowmelt"),
    "HITZE": ("heat", "Heat"),
    "STARKE HITZE": ("heat", "Strong heat"),
    "EXTREME HITZE": ("heat", "Extreme heat"),
    "UV-INDEX": ("uv", "UV index"),
    "NEBEL": ("fog", "Fog"),
}

LEVEL_LABELS = {
    1: "Minor",
    2: "Moderate",
    3: "Severe",
    4: "Extreme",
}


class DwdService:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._warnings: Optional[Dict[str, Any]] = None
        self._warnings_fetched_at = 0.0
        self._cells: Dict[str, Dict[str, Any]] = {}

    # ------------------------------------------------------------------
    def _load_warnings(self) -> Dict[str, Any]:
        with self._lock:
            if self._warnings is not None and time.time() - self._warnings_fetched_at < WARNINGS_TTL_S:
                return self._warnings
        resp = requests.get(WARNINGS_URL, timeout=10)
        resp.raise_for_status()
        text = resp.text.strip()
        start, end = text.find("("), text.rfind(")")
        if start == -1 or end <= start:
            raise ValueError("Unexpected DWD warnings payload (not JSONP).")
        payload = json.loads(text[start + 1:end])
        if "warnings" not in payload:
            raise ValueError("DWD warnings payload has no 'warnings' key.")
        with self._lock:
            self._warnings = payload
            self._warnings_fetched_at = time.time()
        return payload

    def _lookup_cell(self, lat: float, lon: float) -> Optional[Dict[str, Any]]:
        key = f"{lat:.3f},{lon:.3f}"
        with self._lock:
            cached = self._cells.get(key)
            if cached and time.time() - cached["at"] < CELL_TTL_S:
                return cached["value"]
        resp = requests.get(
            WFS_URL,
            params={
                "service": "WFS",
                "version": "1.0.0",
                "request": "GetFeature",
                "typeName": "dwd:Warngebiete_Kreise",
                "outputFormat": "application/json",
                "propertyName": "WARNCELLID,NAME",
                # WFS 1.0.0 + CQL: POINT(x y) = (lon lat)
                "CQL_FILTER": f"INTERSECTS(SHAPE,POINT({lon:.5f} {lat:.5f}))",
            },
            timeout=15,
        )
        resp.raise_for_status()
        features = resp.json().get("features", [])
        value = None
        if features:
            props = features[0].get("properties", {})
            if props.get("WARNCELLID") is not None:
                value = {"cell_id": str(int(props["WARNCELLID"])), "name": props.get("NAME")}
        with self._lock:
            self._cells[key] = {"value": value, "at": time.time()}
        return value

    @staticmethod
    def _ms_to_iso(ms: Any) -> Optional[str]:
        if ms is None:
            return None
        return datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc).isoformat()

    # ------------------------------------------------------------------
    def get_alerts_for_point(self, lat: float, lon: float) -> Dict[str, Any]:
        base = {"source": ATTRIBUTION, "region": None, "alerts": []}

        min_lon, min_lat, max_lon, max_lat = _DE_BBOX
        if not (min_lat <= lat <= max_lat and min_lon <= lon <= max_lon):
            return {**base, "available": False, "reason": "Outside DWD coverage (Germany)."}

        try:
            cell = self._lookup_cell(lat, lon)
        except Exception as exc:
            return {**base, "available": False, "reason": f"DWD warn-area lookup failed: {type(exc).__name__}"}
        if not cell:
            return {**base, "available": False, "reason": "Location is not inside a German DWD warn area."}

        try:
            payload = self._load_warnings()
        except Exception as exc:
            return {
                **base,
                "region": cell["name"],
                "available": False,
                "reason": f"DWD warnings unavailable: {type(exc).__name__}",
            }

        now_ms = datetime.now(timezone.utc).timestamp() * 1000
        alerts: List[Dict[str, Any]] = []
        for w in payload["warnings"].get(cell["cell_id"], []):
            end = w.get("end")
            if end is not None and end < now_ms:
                continue
            event = (w.get("event") or "").strip()
            category, label = _EVENT_MAP.get(event.upper(), ("other", event.title() or "Warning"))
            level = int(w.get("level") or 0)
            alerts.append({
                "event": event,
                "category": category,
                "label": label,
                "level": level,
                "level_label": LEVEL_LABELS.get(level, "Notice"),
                "headline": w.get("headline"),
                "description": w.get("description"),
                "instruction": w.get("instruction"),
                "start": self._ms_to_iso(w.get("start")),
                "end": self._ms_to_iso(end),
                "is_active": w.get("start") is None or w["start"] <= now_ms,
            })
        alerts.sort(key=lambda a: (-a["level"], a["start"] or ""))

        issued = payload.get("time")
        return {
            "available": True,
            "reason": None,
            "source": ATTRIBUTION,
            "region": cell["name"],
            "warn_cell_id": cell["cell_id"],
            "issued_at": self._ms_to_iso(issued),
            "alerts": alerts,
        }


dwd_service = DwdService()
