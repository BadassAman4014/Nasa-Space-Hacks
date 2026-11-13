import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import boundaries, farms, fields, environment, soil, farmer, recommendations, scenarios, reports, ai_field_detection, field_analytics, nasa_challenge, weather

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
    weather.router
]:
    app.include_router(router, prefix='/api')

@app.get('/health')
def health() -> dict[str, str]:
    return {'status': 'ok', 'service': 'fieldshift-api', 'version': '0.2.0'}
