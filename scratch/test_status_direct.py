import sys, os
sys.path.insert(0, os.path.abspath('backend'))

print("Importing AIFieldDetectionService")
from app.services.field_segmentation.service import AIFieldDetectionService
print("Getting instance")
s = AIFieldDetectionService.get_instance()
print("Getting model status")
status = s.get_model_status()
print("Model status:", status.model_dump())
