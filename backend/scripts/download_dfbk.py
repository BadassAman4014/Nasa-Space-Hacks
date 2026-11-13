"""
Download and extract the official Brandenburg Digitales Feldblockkataster (DFBK) dataset.
Source URL: https://data.geobasis-bb.de/geofachdaten/Landwirtschaft/dfbk.zip
Attribution: © MLEUV, dl-de/by-2-0
"""

import os
import sys
import argparse
import urllib.request
import zipfile
import ssl
from pathlib import Path

DFBK_ZIP_URL = "https://data.geobasis-bb.de/geofachdaten/Landwirtschaft/dfbk.zip"

def get_data_dir() -> Path:
    # Anchor to backend/data relative to this script
    script_dir = Path(__file__).resolve().parent
    data_dir = script_dir.parent / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir

def download_dfbk(force: bool = False) -> tuple[Path, Path]:
    data_dir = get_data_dir()
    zip_path = data_dir / "dfbk.zip"
    extract_dir = data_dir / "raw"

    if zip_path.exists() and not force:
        try:
            print(f"[CACHE] Found existing DFBK zip at {zip_path} ({zip_path.stat().st_size:,} bytes). Testing archive...")
            with zipfile.ZipFile(zip_path, 'r') as zf:
                if zf.testzip() is None:
                    print("[CACHE] Archive is valid. Skipping download.")
                else:
                    print("[WARNING] Archive appears corrupted. Re-downloading...")
                    force = True
        except Exception as e:
            print(f"[WARNING] Error testing archive ({e}). Re-downloading...")
            force = True

    if not zip_path.exists() or force:
        print(f"[DOWNLOAD] Downloading official Brandenburg DFBK archive from {DFBK_ZIP_URL}...")
        ctx = ssl.create_default_context()
        req = urllib.request.Request(DFBK_ZIP_URL, headers={"User-Agent": "FieldShift-AI/1.0"})
        
        tmp_zip = zip_path.with_suffix(".tmp")
        try:
            with urllib.request.urlopen(req, context=ctx, timeout=120) as resp, open(tmp_zip, "wb") as out_f:
                total_bytes = int(resp.headers.get("Content-Length", 0))
                downloaded = 0
                chunk_size = 1024 * 512
                while True:
                    chunk = resp.read(chunk_size)
                    if not chunk:
                        break
                    out_f.write(chunk)
                    downloaded += len(chunk)
                    if total_bytes > 0:
                        pct = (downloaded / total_bytes) * 100
                        print(f"\rDownloading: {downloaded / 1_048_576:.1f} MB / {total_bytes / 1_048_576:.1f} MB ({pct:.1f}%)", end="", flush=True)
                print()
            tmp_zip.replace(zip_path)
            print(f"[DOWNLOAD COMPLETE] Saved to {zip_path} ({zip_path.stat().st_size:,} bytes)")
        except Exception as e:
            if tmp_zip.exists():
                tmp_zip.unlink()
            raise RuntimeError(f"Failed to download DFBK archive: {e}")

    # Extract archive
    extract_dir.mkdir(parents=True, exist_ok=True)
    print(f"[EXTRACT] Extracting {zip_path} into {extract_dir}...")
    with zipfile.ZipFile(zip_path, 'r') as zf:
        zf.extractall(extract_dir)

    print("[FILES EXTRACTED]:")
    for f in sorted(extract_dir.glob("*")):
        print(f"  - {f.name} ({f.stat().st_size:,} bytes)")

    return zip_path, extract_dir

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Download and extract Brandenburg DFBK dataset.")
    parser.add_argument("--force", action="store_true", help="Force re-download even if archive exists")
    args = parser.parse_args()
    try:
        download_dfbk(force=args.force)
    except Exception as err:
        print(f"Error: {err}", file=sys.stderr)
        sys.exit(1)

