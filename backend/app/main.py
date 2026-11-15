import os
from pathlib import Path
from dotenv import load_dotenv

os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

# Load .env from backend/ or project root (with .env.example fallback)
_backend_dir = Path(__file__).resolve().parent.parent
load_dotenv(_backend_dir / ".env")
load_dotenv(_backend_dir.parent / ".env")
load_dotenv(_backend_dir / ".env.example")
load_dotenv(_backend_dir.parent / ".env.example")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import (
    boundaries,
    farms,
    fields,
    environment,
    soil,
    farmer,
    recommendations,
    scenarios,
    reports,
    ai_field_detection,
    field_analytics,
    nasa_challenge,
    weather,
    ai_assistant,
    field_health,
    crop_planner,
)

app = FastAPI(title='FieldShift AI API', version='0.2.0')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

for router in [
    boundaries.router,
    farms.router,
    fields.router,
    environment.router,
    soil.router,
    farmer.router,
    recommendations.router,
    scenarios.router,
    reports.router,
    ai_field_detection.router,
    field_analytics.router,
    nasa_challenge.router,
    weather.router,
    ai_assistant.router,
    field_health.router,
    crop_planner.router,
]:
    app.include_router(router, prefix='/api')

@app.on_event('startup')
def _start_appeears_worker() -> None:
    """Poll NASA AppEEARS in the background so queued SMAP/ECOSTRESS extractions get ingested."""
    from app.services.nasa.real.appeears import appeears_worker

    appeears_worker.start()


@app.get('/health')
def health() -> dict[str, str]:
    return {'status': 'ok', 'service': 'fieldshift-api', 'version': '0.2.0'}
