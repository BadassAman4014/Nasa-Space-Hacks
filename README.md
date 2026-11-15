# Farmily

Farmily is a farmer-facing crop rotation decision-support workspace. The frontend is a responsive React/Vite application connected to persisted field records and available environmental data sources. The backend contains the FastAPI contracts and services for validated farm records, Earth observation datasets, weather, soil evidence, and crop-planning recommendations.

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

- Dashboard with farm and field selection, sourced environmental cards, soil evidence, weather, and field map
- Field Explorer with boundary discovery, saved-field management, and map controls
- Field Analytics with field map, health, risk, status, and source catalogue views
- Crop Planner with farmer inputs, automatic SoilGrids evidence, rotation strategies, vulnerability timeline, and nutrient planning
- Weather workspace with selected-field forecasts, DWD warnings, virtual stations, and spraying windows
- AI assistant grounded in the selected field's available data
- Typed frontend API integration and FastAPI services

## Remaining integrations

Validated farm and field persistence, NASA POWER/SMAP/GPM/MODIS/Landsat ingestion, SoilGrids retrieval, calibrated ML/optimisation services, authenticated report generation and production map tiles.
