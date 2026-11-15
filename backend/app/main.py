import os
from pathlib import Path
from dotenv import load_dotenv

os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

# Load runtime secrets from .env files only. Example files are documentation
# and must never become credential sources.
_backend_dir = Path(__file__).resolve().parent.parent
load_dotenv(_backend_dir / ".env")
load_dotenv(_backend_dir.parent / ".env")

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
    field_analytics,
    nasa_challenge,
    weather,
    ai_assistant,
    field_health,
    crop_planner,
)

app = FastAPI(title='Farmily API', version='0.2.0')

# The field-segmentation router imports PyTorch. Keep it disabled by default so
# low-memory deployments can start the rest of the API. Enable it only on an
# instance with enough memory for model inference.
field_segmentation_enabled = os.getenv("ENABLE_FIELD_SEGMENTATION", "false").lower() == "true"
if field_segmentation_enabled:
    from app.api import ai_field_detection

# CORS configuration
cors_origins = os.getenv('CORS_ORIGINS', '*')
if cors_origins == '*':
    allow_origins = ['*']
else:
    allow_origins = [origin.strip() for origin in cors_origins.split(',')]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
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
    field_analytics.router,
    nasa_challenge.router,
    weather.router,
    ai_assistant.router,
    field_health.router,
    crop_planner.router,
]:
    app.include_router(router, prefix='/api')

if field_segmentation_enabled:
    app.include_router(ai_field_detection.router, prefix='/api')

@app.on_event('startup')
def _start_appeears_worker() -> None:
    """Poll NASA AppEEARS in the background so queued SMAP/ECOSTRESS extractions get ingested."""
    from app.services.nasa.real.appeears import appeears_worker

    appeears_worker.start()


@app.get('/health')
@app.get('/api/health')
def health() -> dict[str, str]:
    return {'status': 'ok', 'service': 'fieldshift-api', 'version': '0.2.0'}
