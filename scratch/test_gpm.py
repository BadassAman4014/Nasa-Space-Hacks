"""Probe GPM IMERG access paths. Never prints secrets."""
import os
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / "backend" / ".env")
U = os.getenv("EARTHDATA_USERNAME", "").strip()
P = os.getenv("EARTHDATA_PASSWORD", "").strip()


class EDLSession(requests.Session):
    """Keeps basic auth only for the Earthdata Login host across redirects."""

    AUTH_HOST = "urs.earthdata.nasa.gov"

    def rebuild_auth(self, prepared_request, response):
        headers = prepared_request.headers
        url = requests.utils.urlparse(prepared_request.url)
        if "Authorization" in headers and url.hostname != self.AUTH_HOST:
            del headers["Authorization"]
        elif url.hostname == self.AUTH_HOST and self.auth:
            prepared_request.prepare_auth(self.auth)


s = EDLSession()
s.auth = (U, P)
base = "https://gpm1.gesdisc.eosdis.nasa.gov/opendap/GPM_L3/GPM_3IMERGDF.07/2024/06/3B-DAY.MS.MRG.3IMERG.20240601-S000000-E235959.V07B.nc4"
# lon index for 14.31E: (14.31+180)/0.1 = 1943 ; lat index for 51.76N: (51.76+90)/0.1 = 1417
for label, url in [
    ("dap4 nc4 subset", base + ".dap.nc4?dap4.ce=/precipitation[0:1:0][1942:1:1944][1416:1:1418]"),
    ("dap2 ascii subset", base + ".ascii?precipitation[0:0][1942:1943][1416:1417]"),
]:
    t0 = time.time()
    try:
        r = s.get(url, timeout=120)
        print(label, r.status_code, len(r.content), "bytes", round(time.time() - t0, 1), "s", r.headers.get("content-type"))
        print("   ", r.text[:300].replace("\n", " | ") if "text" in (r.headers.get("content-type") or "") else "(binary)")
    except Exception as e:
        print(label, "ERR", type(e).__name__, e)

# Hydrology data rods (point time series, no auth) for IMERG
t0 = time.time()
r = requests.get(
    "https://hydro1.gesdisc.eosdis.nasa.gov/daac-bin/access/timeseries.cgi",
    params={
        "variable": "GPM:GPM_3IMERGHH.07:precipitation",
        "location": "GEOM:POINT(14.31, 51.76)",
        "startDate": "2024-06-01T00",
        "endDate": "2024-06-02T00",
        "type": "asc2",
    },
    timeout=120,
)
print("data rods IMERG HH", r.status_code, round(time.time() - t0, 1), "s")
print("   ", r.text[:400].replace("\n", " | "))
