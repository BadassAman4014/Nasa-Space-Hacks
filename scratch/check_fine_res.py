"""Check fine-resolution NASA coverage over the Cottbus field via CMR (public metadata, no download)."""
import requests

BBOX = "14.29,51.77,14.31,51.79"  # around field centroid 14.30E 51.78N
CMR = "https://cmr.earthdata.nasa.gov/search"
checks = [
    ("ECOSTRESS LST 70 m (ECO_L2T_LSTE v002)", "ECO_L2T_LSTE", "002"),
    ("ECOSTRESS ET 70 m (ECO_L3T_JET v002)", "ECO_L3T_JET", "002"),
    ("ECOSTRESS evaporative stress (ECO_L4T_ESI v002)", "ECO_L4T_ESI", "002"),
    ("HLS Landsat 30 m (HLSL30 v2.0)", "HLSL30", "2.0"),
    ("HLS Sentinel-2 30 m (HLSS30 v2.0)", "HLSS30", "2.0"),
    ("SMAP/Sentinel-1 3 km (SPL2SMAP_S v003)", "SPL2SMAP_S", "003"),
    ("GLDAS Noah 0.25 deg daily (GLDAS_NOAH025_3H v2.1)", "GLDAS_NOAH025_3H", "2.1"),
]
for label, sn, ver in checks:
    c = requests.get(f"{CMR}/collections.json", params={"short_name": sn, "version": ver}, timeout=30).json()["feed"]["entry"]
    if not c:
        print(f"{label}: collection not found")
        continue
    cid = c[0]["id"]
    for period in ("2026-04-01T00:00:00Z,2026-10-31T23:59:59Z", "2026-10-01T00:00:00Z,2026-11-14T23:59:59Z"):
        r = requests.get(f"{CMR}/granules.json", params={"collection_concept_id": cid, "bounding_box": BBOX, "temporal": period, "page_size": 2000}, timeout=60)
        hits = r.headers.get("CMR-Hits")
        latest = sorted(g["time_start"][:10] for g in r.json()["feed"]["entry"])[-1:] if r.json()["feed"]["entry"] else []
        print(f"{label} | {period[:10]}..{period[21:31]} | granules over field: {hits} | latest: {latest}")
