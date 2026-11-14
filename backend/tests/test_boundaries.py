"""
Comprehensive test suite for Brandenburg agricultural field discovery.
Tests category filtering, geometry validation, area calculation,
viewport spatial indexing, boundary retrieval, field import workflow,
and geometry editing.
"""

import tempfile
import unittest
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from shapely.geometry import Polygon
from app.services.field_boundaries.geometry_service import (
    calculate_area_hectares,
    ensure_valid_polygon,
    subtract_exclusions
)
from app.services.field_boundaries.dfbk_service import dfbk_service
from app.services.field_boundaries.boundary_provider import boundary_provider
from app.services.field_boundaries.invekos_service import invekos_service
from app.services.user_farms_repository import UserFarmsRepository
from app.api.boundaries import (
    get_boundaries_status,
    get_boundaries_viewport,
    get_boundary_by_id,
    search_boundaries
)
from app.api.fields import (
    import_boundaries,
    save_field_geometry,
    get_farm_fields,
    ImportBoundariesRequest,
    EditGeometryRequest
)

class TestBoundaryDiscovery(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.TemporaryDirectory()
        cls.test_db_path = Path(cls.temp_dir.name) / "test_user_farms.db"
        cls.orig_repo = boundary_provider.user_repo
        boundary_provider.user_repo = UserFarmsRepository(cls.test_db_path)

    @classmethod
    def tearDownClass(cls):
        boundary_provider.user_repo = cls.orig_repo
        cls.temp_dir.cleanup()

    def test_boundary_status(self):
        data = get_boundaries_status()
        self.assertIn("providers", data)
        self.assertGreater(data["active_records"], 80_000)
        self.assertIn("DFBK", data["primary_provider"])
        self.assertEqual(data["dataset_version"], "DFBK-2026.1")

    def test_geometry_area_calculation(self):
        # 100m x 100m square in EPSG:25833 planar coordinates = 10,000 m2 = 1.0 ha
        square_1ha = Polygon([(0, 0), (100, 0), (100, 100), (0, 100), (0, 0)])
        area_ha = calculate_area_hectares(square_1ha, is_wgs84=False)
        self.assertAlmostEqual(area_ha, 1.0, places=3)

    def test_geometry_validation_and_repair(self):
        # Self-intersecting bowtie polygon
        invalid_bowtie = Polygon([(0, 0), (10, 10), (10, 0), (0, 10), (0, 0)])
        self.assertFalse(invalid_bowtie.is_valid)
        repaired = ensure_valid_polygon(invalid_bowtie)
        self.assertIsNotNone(repaired)
        self.assertTrue(repaired.is_valid)

    def test_nbf_exclusion_subtraction(self):
        # 200m x 200m base field (4 ha)
        base_field = Polygon([(0, 0), (200, 0), (200, 200), (0, 200), (0, 0)])
        # 50m x 50m ditch/exclusion (0.25 ha) inside the field
        ditch = Polygon([(50, 50), (100, 50), (100, 100), (50, 100), (50, 50)])
        usable = subtract_exclusions(base_field, [ditch])
        self.assertTrue(usable.is_valid)
        self.assertAlmostEqual(calculate_area_hectares(usable), 3.75, places=2)

    def test_viewport_potsdam_retrieval(self):
        # Bounding box encompassing Potsdam agricultural surroundings
        data = get_boundaries_viewport(
            west=12.95,
            south=52.35,
            east=13.15,
            north=52.48,
            limit=100
        )
        self.assertEqual(data["type"], "FeatureCollection")
        self.assertGreater(len(data["features"]), 0)

        # Verify first feature has valid agricultural attributes
        first = data["features"][0]
        self.assertIn("properties", first)
        self.assertIn("land_use_category", first["properties"])
        self.assertIn(first["properties"]["land_use_category"], [
            "AL", "GL", "DK", "AL-AF", "GL-AF", "DK-AF", "AL-APV", "GL-APV", "DK-APV", "GL-ELP", "GL-MO"
        ])
        # Verify excluded categories are NOT present
        self.assertNotIn(first["properties"]["land_use_category"], ["HE", "34A", "34G"])
        self.assertGreater(first["properties"]["official_net_ha"], 0)
        self.assertIn("geometry", first)
        self.assertEqual(first["geometry"]["type"], "Polygon")

    def test_category_filtering(self):
        # Query exclusively arable land (AL)
        data = get_boundaries_viewport(
            west=12.95,
            south=52.35,
            east=13.15,
            north=52.48,
            land_use_category="AL",
            limit=50
        )
        for f in data["features"]:
            self.assertEqual(f["properties"]["land_use_category"], "AL")

    def test_search_municipality(self):
        data = search_boundaries(location="Potsdam", limit=20)
        self.assertGreater(len(data["features"]), 0)

    def test_single_boundary_lookup(self):
        v_data = get_boundaries_viewport(
            west=13.0, south=52.4, east=13.1, north=52.45, limit=1
        )
        b_id = v_data["features"][0]["id"]

        data = get_boundary_by_id(b_id)
        self.assertEqual(data["external_id"], b_id)
        self.assertIn("geometry", data)

    def test_field_import_workflow(self):
        # 1. Fetch 2 boundaries near Potsdam
        v_data = get_boundaries_viewport(
            west=13.0, south=52.4, east=13.1, north=52.45, limit=2
        )
        b_ids = [f["id"] for f in v_data["features"][:2]]
        self.assertEqual(len(b_ids), 2)

        # 2. Import into a test farm
        farm_id = "test-farm-brandenburg"
        custom_names = {b_ids[0]: "North Block Field", b_ids[1]: "South Pasture"}
        import_req = ImportBoundariesRequest(
            farm_id=farm_id,
            boundary_ids=b_ids,
            custom_names=custom_names
        )
        import_data = import_boundaries(import_req)
        self.assertEqual(import_data["imported_count"], 2)
        self.assertEqual(import_data["fields"][0]["name"], "North Block Field")
        self.assertEqual(import_data["fields"][1]["name"], "South Pasture")
        self.assertEqual(import_data["fields"][0]["current_crop"], "")
        self.assertEqual(import_data["fields"][1]["current_crop"], "")

        # 3. Verify farm field listing
        fields_data = get_farm_fields(farm_id)
        self.assertEqual(len(fields_data["fields"]), 2)

    def test_farmer_geometry_editing(self):
        # Create or edit a field geometry
        field_id = "field-custom-edit-1"
        edited_polygon = {
            "type": "Polygon",
            "coordinates": [[[13.05, 52.42], [13.06, 52.42], [13.06, 52.43], [13.05, 52.43], [13.05, 52.42]]]
        }
        update_req = EditGeometryRequest(geometry=edited_polygon)
        field_resp = save_field_geometry(field_id, update_req)
        self.assertEqual(field_resp["field"]["geometry"], edited_polygon)
        self.assertEqual(field_resp["field"]["current_crop"], "")
        self.assertGreater(field_resp["field"]["area_hectares"], 0)

    def test_invekos_service_fallback(self):
        status = invekos_service.check_availability()
        self.assertIn("status", status)

if __name__ == "__main__":
    unittest.main()
