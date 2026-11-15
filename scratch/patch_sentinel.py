"""Remove synthetic NDVI fallbacks from the Sentinel-2 services."""
import re
from pathlib import Path

p = Path("backend/app/services/field_analytics/sentinel_service.py")
s = p.read_text(encoding="utf-8")

# 1. History window: last three full seasons plus the current one.
s = s.replace(
    'DEFAULT_HISTORY_START = "2016-01-01"',
    'DEFAULT_HISTORY_START = f"{date.today().year - 3}-01-01"\n\n#: Parallel scene reads (each scene is ~5-15 s of HTTP range requests).\nSCENE_WORKERS = 6',
)

# 2. Discovery failure is reported, not replaced with invented scenes.
s = s.replace(
    "        except Exception:\n            return self.generate_canonical_scenes(field_id, geom)\n",
    "        except RasterUnavailable:\n            raise\n        except Exception as exc:\n            raise RasterUnavailable(f\"Sentinel-2 scene search failed: {type(exc).__name__}\") from exc\n",
)

# 3. Drop the canonical-scene and synthetic-observation generators entirely.
i = s.index("    def generate_canonical_scenes(")
j = s.index("    def compute_observation(")
# keep the section header comment that precedes compute_observation
k = s.rfind("    # ------------------------------------------------------------------", i, j)
k = s.rfind("    # ------------------------------------------------------------------", i, k)
s = s[:i] + s[k:]

# 4. compute_observation: return None instead of synthesising.
s = s.replace(
    "        Falls back to authentic high-resolution synthesis if remote assets are unreachable.\n",
    "        Returns None when the scene cannot be read or has too few valid field pixels;\n        nothing is synthesised.\n",
)
s = s.replace(
    "    ) -> Dict[str, Any]:\n        \"\"\"\n        Read B04/B08/SCL",
    "    ) -> Optional[Dict[str, Any]]:\n        \"\"\"\n        Read B04/B08/SCL",
)
s = re.sub(
    r"return self\.synthesize_field_observation\(field_id, geom, scene, render_previews=render_previews\)",
    "return None",
    s,
)

# 5. build_time_series: no invented scenes, parallel reads, drop unreadable scenes.
old_bts = s[s.index("    def build_time_series("):s.index("    def latest_valid(")]
new_bts = '''    def build_time_series(
        self,
        field_id: str,
        geom: Dict[str, Any],
        start_date: str = DEFAULT_HISTORY_START,
        end_date: Optional[str] = None,
        max_cloud_cover: float = 20.0,
        limit: Optional[int] = None,
        skip_scene_ids: Optional[set] = None,
    ) -> List[Dict[str, Any]]:
        """
        Discover real scenes and compute NDVI for each, in parallel.
        Scenes that cannot be read or are mostly cloud inside the field are dropped.
        Raises RasterUnavailable when the catalogue or GDAL stack is unavailable.
        """
        from concurrent.futures import ThreadPoolExecutor

        scenes = self.discover_observations(field_id, geom, start_date, end_date, max_cloud_cover)
        if skip_scene_ids:
            scenes = [sc for sc in scenes if sc.get("scene_id") not in skip_scene_ids]
        if limit:
            scenes = scenes[:limit]
        if not scenes:
            return []
        grid = s2_raster.build_field_grid(shape(geom), self.max_resolution_m)
        with ThreadPoolExecutor(max_workers=SCENE_WORKERS) as pool:
            results = list(pool.map(lambda sc: self.compute_observation(field_id, geom, sc, grid=grid), scenes))
        return [r for r in results if r is not None]

'''
s = s.replace(old_bts, new_bts)
p.write_text(s, encoding="utf-8", newline="\n")
print("sentinel_service patched")

# --- report_service --------------------------------------------------------
p = Path("backend/app/services/field_analytics/report_service.py")
s = p.read_text(encoding="utf-8")
s = s.replace(
    """            except RasterUnavailable as exc:
                raw_extracted = sentinel_service.generate_canonical_scenes(field_id, poly_geom)
                raw_extracted = [sentinel_service.compute_observation(field_id, poly_geom, s) for s in raw_extracted]
                unavailable_note = str(exc)""",
    """            except RasterUnavailable as exc:
                raw_extracted = []
                unavailable_note = str(exc)""",
)
i = s.index("        else:\n            # Heal existing records")
j = s.index("        # Retrieve the requested batch")
s = s[:i] + s[j:]
p.write_text(s, encoding="utf-8", newline="\n")
print("report_service patched")
