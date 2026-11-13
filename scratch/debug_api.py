import sys, os
sys.path.insert(0, os.path.abspath('backend'))
from fastapi.testclient import TestClient
from app.main import app

with TestClient(app) as client:
    res = client.get("/api/ai-field-detection/model/status")
    print("Status code:", res.status_code)
    print("Model ready:", res.json()["model_ready"])
