"""
Test suite for persistent user farms and fields repository and API endpoints.
Tests farm CRUD, field CRUD, geometry validation, duplicate prevention,
MultiPolygon support, and persistence across repository reload.
"""

import unittest
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.services.user_farms_repository import UserFarmsRepository
from app.api.farms import create_farm, list_farms, get_farm, delete_farm, CreateFarmRequest
from app.api.fields import (
    create_field,
    list_all_fields,
    get_field,
    update_field,
    delete_field,
    CreateFieldRequest,
    UpdateFieldRequest
)

class TestUserFarmsFields(unittest.TestCase):
    def setUp(self):
        # Use an isolated test database
        self.test_db_path = backend_dir / "data" / "test_user_storage.db"
        if self.test_db_path.exists():
            self.test_db_path.unlink()
        self.repo = UserFarmsRepository(db_path=self.test_db_path)

    def tearDown(self):
        if self.test_db_path.exists():
            try:
                self.test_db_path.unlink()
            except Exception:
                pass

    def test_start_with_empty_database(self):
        farms = self.repo.list_farms()
        fields = self.repo.list_fields()
        self.assertEqual(len(farms), 0)
        self.assertEqual(len(fields), 0)

    def test_create_farm_and_field_lifecycle(self):
        # 1. Create farm
        farm = self.repo.create_farm(name="Test Farm", location="Potsdam, Brandenburg")
        self.assertIn("id", farm)
        self.assertEqual(farm["name"], "Test Farm")
        self.assertEqual(farm["field_count"], 0)
        self.assertEqual(farm["total_area_ha"], 0.0)

        # 2. Create field in farm
        test_poly = {
            "type": "Polygon",
            "coordinates": [[[13.04, 52.41], [13.06, 52.41], [13.06, 52.42], [13.04, 52.42], [13.04, 52.41]]]
        }
        field = self.repo.create_field(
            farm_id=farm["id"],
            name="Field 1",
            geometry=test_poly,
            current_crop="Winter wheat",
            source_boundary_id="DEBBLI0123456789",
            boundary_source="DFBK",
            land_use_category="AL"
        )
        self.assertEqual(field["name"], "Field 1")
        self.assertEqual(field["farm_id"], farm["id"])
        self.assertEqual(field["current_crop"], "Winter wheat")
        self.assertGreater(field["area_hectares"], 50.0)

        # 3. Check farm aggregation
        updated_farm = self.repo.get_farm(farm["id"])
        self.assertEqual(updated_farm["field_count"], 1)
        self.assertGreater(updated_farm["total_area_ha"], 50.0)

        # 4. Update field (rename and crop)
        updated_field = self.repo.update_field(
            field_id=field["id"],
            name="Field 1 - Renamed",
            current_crop="Field peas"
        )
        self.assertEqual(updated_field["name"], "Field 1 - Renamed")
        self.assertEqual(updated_field["current_crop"], "Field peas")

        # 5. Delete field
        deleted = self.repo.delete_field(field["id"])
        self.assertTrue(deleted)
        self.assertIsNone(self.repo.get_field(field["id"]))

        # Farm now has 0 fields
        self.assertEqual(self.repo.get_farm(farm["id"])["field_count"], 0)

    def test_duplicate_prevention(self):
        farm = self.repo.create_farm(name="Farm A")
        poly = {
            "type": "Polygon",
            "coordinates": [[[13.0, 52.4], [13.01, 52.4], [13.01, 52.41], [13.0, 52.41], [13.0, 52.4]]]
        }
        f1 = self.repo.create_field(farm_id=farm["id"], name="F1", geometry=poly, source_boundary_id="DEBB_DUP_1")
        f2 = self.repo.create_field(farm_id=farm["id"], name="F1 Duplicate", geometry=poly, source_boundary_id="DEBB_DUP_1")

        self.assertEqual(f1["id"], f2["id"])
        self.assertEqual(len(self.repo.list_fields(farm_id=farm["id"])), 1)

    def test_multipolygon_geometry_support(self):
        farm = self.repo.create_farm(name="Multi Farm")
        multi_poly = {
            "type": "MultiPolygon",
            "coordinates": [
                [[[13.00, 52.40], [13.01, 52.40], [13.01, 52.41], [13.00, 52.41], [13.00, 52.40]]],
                [[[13.02, 52.40], [13.03, 52.40], [13.03, 52.41], [13.02, 52.41], [13.02, 52.40]]]
            ]
        }
        field = self.repo.create_field(
            farm_id=farm["id"],
            name="Disjoint Multi Field",
            geometry=multi_poly,
            current_crop="Barley"
        )
        self.assertEqual(field["geometry"]["type"], "MultiPolygon")
        self.assertGreater(field["area_hectares"], 100.0)

    def test_invalid_geometry_rejection(self):
        farm = self.repo.create_farm(name="Invalid Geom Farm")
        invalid_geom = {
            "type": "Polygon",
            "coordinates": [[[13.0, 52.4]]] # Not enough points to form a polygon
        }
        with self.assertRaises(Exception):
            self.repo.create_field(farm_id=farm["id"], name="Bad Field", geometry=invalid_geom)

    def test_persistence_across_reload(self):
        # 1. Save record in repo 1
        farm = self.repo.create_farm(name="Persistent Farm", location="Brandenburg")
        poly = {
            "type": "Polygon",
            "coordinates": [[[13.05, 52.42], [13.07, 52.42], [13.07, 52.43], [13.05, 52.43], [13.05, 52.42]]]
        }
        field = self.repo.create_field(farm_id=farm["id"], name="Persistent Field", geometry=poly, current_crop="Oats")

        # 2. Simulate server restart: create new UserFarmsRepository instance pointing to same file
        reloaded_repo = UserFarmsRepository(db_path=self.test_db_path)
        farms = reloaded_repo.list_farms()
        self.assertEqual(len(farms), 1)
        self.assertEqual(farms[0]["name"], "Persistent Farm")

        saved_field = reloaded_repo.get_field(field["id"])
        self.assertIsNotNone(saved_field)
        self.assertEqual(saved_field["name"], "Persistent Field")
        self.assertEqual(saved_field["current_crop"], "Oats")
        self.assertEqual(saved_field["geometry"]["coordinates"], poly["coordinates"])

if __name__ == "__main__":
    unittest.main()

