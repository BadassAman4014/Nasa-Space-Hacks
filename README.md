# FieldShift AI

FieldShift AI is a farmer-facing crop rotation decision-support workspace for Brandenburg, Germany. The frontend is a responsive React/Vite application with demonstration data clearly marked throughout the interface. The backend folder contains the intended FastAPI contract and service boundary for connecting validated farm records, NASA Earth observation datasets and calibrated recommendation models.

## Frontend

The project uses the existing Vite setup. The frontend reads `VITE_API_BASE_URL` when live API calls are enabled and otherwise remains usable with the built-in demonstration experience.

Example environment value:

```text
VITE_API_BASE_URL=http://localhost:8000/api
```

## Backend

From `backend/`, install `requirements.txt`, then start the FastAPI application with Uvicorn using `app.main:app`. The backend currently exposes typed endpoint contracts and intentionally leaves NASA ingestion, persistence and model inference unimplemented rather than presenting fabricated results as live science.

Backend configuration is documented in `backend/.env.example`.

## Completed modules

- Dashboard with farm selector, environmental cards, suitability, soil trend, weather and satellite-style field map
- Field Explorer with field selection, map controls and demonstration layer toggles
- Environmental Profile with overview, climate, soil, vegetation and data provenance views
- Farmer Profile with multi-step details, crop history, priorities and constraints
- Rotation Studio with baseline, water-resilient and soil-health-focused strategies
- Climate Scenario Simulator with adjustable hypothetical assumptions and impact ranking
- Reports & Evidence with sources, model limitations and report preview
- Typed frontend API integration layer and FastAPI skeleton

## Remaining integrations

Validated farm and field persistence, NASA POWER/SMAP/GPM/MODIS/Landsat ingestion, SoilGrids retrieval, calibrated ML/optimisation services, authenticated report generation and production map tiles.
