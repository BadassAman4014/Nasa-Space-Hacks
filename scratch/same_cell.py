"""Check whether the probe point and the field centroids fall in the same SMAP EASE-Grid 2.0 9 km cell."""
import csv

from pyproj import Transformer

T = Transformer.from_crs("EPSG:4326", "EPSG:6933", always_xy=True)
CELL = 9008.055
X0, Y0 = -17367530.445, 7314540.830  # EASE-Grid 2.0 global 9 km upper-left corner


def cell(lat, lon):
    x, y = T.transform(lon, lat)
    return int((x - X0) // CELL), int((Y0 - y) // CELL)


rows = list(csv.DictReader(open("scratch/appeears_out/fieldshift-cottbus-smap-probe-SPL4SMGP-008-results.csv", encoding="utf-8")))
probe_csv = (int(float(rows[0]["SPL4SMGP_008_Sample_X_9.00805km"])), int(float(rows[0]["SPL4SMGP_008_Line_Y_9.00805km"])))
print("CSV grid index (x,y):", probe_csv)
print("my calc for probe point (51.78004, 14.3014):", cell(51.78004, 14.3014))
for name, lat, lon in (("Field 2", 51.7697, 14.2730), ("Field 1", 51.7683, 14.2848)):
    print(name, cell(lat, lon))
