"""
NASA Earthdata Login authentication handler.
Supports URS OAuth / Bearer Token / Session authentication for NASA DAAC downloads
(NSIDC for SMAP, GES DISC for GPM, LP DAAC for MODIS).
"""

import os
import requests
from typing import Any, Optional

URS_AUTH_URL = "https://urs.earthdata.nasa.gov"

class EarthdataAuth:
    def __init__(self):
        self.username = os.getenv("EARTHDATA_USERNAME", "").strip()
        self.password = os.getenv("EARTHDATA_PASSWORD", "").strip()
        self.token = os.getenv("EARTHDATA_TOKEN", "").strip()

    @property
    def is_configured(self) -> bool:
        """Check if user has provided Earthdata Login credentials or token."""
        return bool(self.token or (self.username and self.password))

    def get_auth_status(self) -> dict[str, Any]:
        """Return status information for Earthdata authentication."""
        return {
            "is_configured": self.is_configured,
            "has_token": bool(self.token),
            "has_user_pass": bool(self.username and self.password),
            "username": self.username[:3] + "***" if self.username else None,
            "instruction": (
                "To enable direct real-time downloads from NASA DAACs, set EARTHDATA_USERNAME "
                "and EARTHDATA_PASSWORD (or EARTHDATA_TOKEN) in your environment or .env file. "
                "Free accounts can be created at https://urs.earthdata.nasa.gov/"
            ),
        }

    def create_session(self) -> requests.Session:
        """
        Create a requests.Session configured with NASA Earthdata credentials.
        Follows redirects and retains basic auth headers on URS redirects.
        """
        session = requests.Session()

        if self.token:
            session.headers.update({"Authorization": f"Bearer {self.token}"})
        elif self.username and self.password:
            session.auth = (self.username, self.password)

        return session

earthdata_auth = EarthdataAuth()

