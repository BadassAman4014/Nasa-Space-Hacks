"""
Inspect the extracted Brandenburg DFBK shapefiles and attributes.
Uses pyogrio for high-performance reading of spatial and tabular records.
"""

from pathlib import Path
import pyogrio

def inspect():
    raw_dir = Path(__file__).resolve().parent.parent / "data" / "raw"
    fb_shp = raw_dir / "DFBK_FB.shp"
    nbf_shp = raw_dir / "DFBK_NBF.shp"
    le_shp = raw_dir / "DFBK_LE.shp"
    zuord_dbf = raw_dir / "dok" / "DFBK_ZUORDNUNG.dbf"
    if not zuord_dbf.exists():
        zuord_dbf = raw_dir / "DFBK_ZUORDNUNG.dbf"

    print("=================================================================")
    print("      BRANDENBURG DFBK DATASET INSPECTION REPORT")
    print("=================================================================")
    
    if not fb_shp.exists():
        print(f"Error: {fb_shp} not found. Run download_dfbk.py first.")
        return

    # 1. Field Blocks (DFBK_FB)
    print("\n[1] FIELD BLOCKS (DFBK_FB.shp)")
    info_fb = pyogrio.read_info(fb_shp)
    print(f"    Total Feature Count : {info_fb['features']:,}")
    print(f"    Coordinate Reference: {info_fb['crs']}")
    print(f"    Geometry Type       : {info_fb['geometry_type']}")
    print(f"    Fields              : {list(info_fb['fields'])}")
    print(f"    Spatial Bounds (m)  : {info_fb.get('total_bounds')}")

    # Inspect HBN_KAT distribution
    print("\n[2] AGRICULTURAL CATEGORIES (HBN_KAT distribution in DFBK_FB)")
    df_hbn = pyogrio.read_dataframe(fb_shp, columns=['HBN_KAT', 'FL_NETTO', 'FB_ID'])
    total_fb = len(df_hbn)
    counts = df_hbn['HBN_KAT'].value_counts()
    for cat, cnt in counts.items():
        sub_df = df_hbn[df_hbn['HBN_KAT'] == cat]
        total_ha = sub_df['FL_NETTO'].sum()
        print(f"    {cat:<12} : {cnt:>7,} polygons ({cnt/total_fb*100:>5.1f}%) | {total_ha:>10,.1f} ha")

    # 3. Non-Agricultural Features (DFBK_NBF)
    if nbf_shp.exists():
        print("\n[3] NON-AGRICULTURAL EXCLUSIONS (DFBK_NBF.shp)")
        info_nbf = pyogrio.read_info(nbf_shp)
        print(f"    Total Feature Count : {info_nbf['features']:,}")
        print(f"    Geometry Type       : {info_nbf['geometry_type']}")
        print(f"    Fields              : {list(info_nbf['fields'])}")

    # 4. Landscape Elements (DFBK_LE)
    if le_shp.exists():
        print("\n[4] LANDSCAPE ELEMENTS (DFBK_LE.shp)")
        info_le = pyogrio.read_info(le_shp)
        print(f"    Total Feature Count : {info_le['features']:,}")
        print(f"    Fields              : {list(info_le['fields'])}")

    # 5. Field Block to LE Zuordnung
    if zuord_dbf.exists():
        print("\n[5] FB - LE RELATIONSHIPS (DFBK_ZUORDNUNG.dbf)")
        info_z = pyogrio.read_info(zuord_dbf)
        print(f"    Total Relation Count: {info_z['features']:,}")
        print(f"    Fields              : {list(info_z['fields'])}")

    print("\n=================================================================")
    print("                     INSPECTION COMPLETED")
    print("=================================================================")

if __name__ == "__main__":
    inspect()
