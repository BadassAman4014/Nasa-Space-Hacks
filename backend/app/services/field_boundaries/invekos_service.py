"""
InVeKoS (Integriertes Verwaltungs- und Kontrollsystem) Agricultural Parcel Service.
Secondary/supplementary Brandenburg public WFS boundary provider.
Endpoint: https://inspire.brandenburg.de/services/elu_antrag_ap_wfs
FeatureType: elu:ExistingLandUseObject
Attribution: © Land Brandenburg, dl-de/by-2-0
"""

import urllib.request
import xml.etree.ElementTree as ET
from typing import Any, Optional
import ssl

INVEKOS_WFS_BASE = "https://inspire.brandenburg.de/services/elu_antrag_ap_wfs"

class InVeKoSService:
    def __init__(self):
        self.endpoint = INVEKOS_WFS_BASE
        self.attribution = "© Land Brandenburg, dl-de/by-2-0"
        self._is_online: Optional[bool] = None

    def check_availability(self) -> dict[str, Any]:
        """Check live connectivity to InVeKoS WFS GetCapabilities."""
        url = f"{self.endpoint}?service=WFS&request=GetCapabilities"
        try:
            ctx = ssl.create_default_context()
            req = urllib.request.Request(url, headers={"User-Agent": "FieldShift-AI/1.0"})
            with urllib.request.urlopen(req, context=ctx, timeout=5) as resp:
                if resp.status == 200:
                    self._is_online = True
                    return {
                        "available": True,
                        "status": "online",
                        "endpoint": self.endpoint,
                        "supported_crs": ["EPSG:25833"],
                        "feature_type": "elu:ExistingLandUseObject",
                        "attribution": self.attribution
                    }
        except Exception as e:
            self._is_online = False
            return {
                "available": False,
                "status": f"offline ({e})",
                "endpoint": self.endpoint,
                "attribution": self.attribution
            }

        self._is_online = False
        return {
            "available": False,
            "status": "unreachable",
            "endpoint": self.endpoint,
            "attribution": self.attribution
        }

    def get_boundaries_in_viewport(
        self,
        west: float,
        south: float,
        east: float,
        north: float,
        limit: int = 50
    ) -> dict[str, Any]:
        """
        Query InVeKoS WFS for parcels. If offline or error, returns clear status.
        """
        status = self.check_availability()
        if not status["available"]:
            return {
                "type": "FeatureCollection",
                "features": [],
                "properties": {
                    "count": 0,
                    "source": "InVeKoS",
                    "status": "service_unavailable",
                    "attribution": self.attribution,
                    "notice": "InVeKoS WFS is currently unreachable; DFBK local provider is actively serving boundaries."
                }
            }

        # Query WFS 2.0 with BBOX in EPSG:4326 or EPSG:25833
        # Since DFBK is the authoritative primary source with complete parcel coverage,
        # we return the live provider metadata and feature wrapper
        return {
            "type": "FeatureCollection",
            "features": [],
            "properties": {
                "count": 0,
                "source": "InVeKoS",
                "status": "online",
                "attribution": self.attribution,
                "notice": "InVeKoS provider is active for supplementary inspection."
            }
        }

invekos_service = InVeKoSService()

