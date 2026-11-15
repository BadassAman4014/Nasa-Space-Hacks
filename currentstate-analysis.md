# FieldShift AI: Current State Analysis

Snapshot date: 2026-11-15 (system clock of the machine that ran the analysis).
Scope: frontend (`src/`), backend (`backend/app/`), local data stores (`backend/data`, `backend/app/data`), launch scripts. Git history and diffs were not used.

## 0. How this was produced

| Method | What it covered |
|---|---|
| Source reading | Every router in `backend/app/api`, every service package in `backend/app/services`, every page and service module in `src/`. |
| Database inspection (read-only SQLite) | Row counts and contents of the six SQLite files, to separate "code exists" from "data exists". |
| Live API probes | `curl`-style calls against the running backend (`127.0.0.1:8000`) for the main endpoints of Field 2. |
| Playwright pass | Headless Chromium against the running app (`127.0.0.1:5173`). Visited all 10 routes, clicked the Health/Status/Data tabs and the Dashboard NASA tab, recorded every `/api/*` call, status code, console error, page text and screenshot. No console errors and no non-200 responses on any route. |

Limits: I did not wait for a cold build of the full analytics report (`/analytics/report`) to finish; my probe timed out after 300 s (see 6.6). I did not run the AI chat (it would send field data to Gemini) or the AI field scan (CPU inference). AppEEARS and Earthdata calls were not triggered.

### Verdict legend used in every table

| Tag | Meaning |
|---|---|
| **LIVE** | Fetched from an external service during the request. |
| **CACHED** | Real data fetched earlier and stored locally (SQLite or files). The true observation date is kept. |
| **LOCAL** | Real reference dataset or model weights stored on disk (DFBK, SoilGrids tiles, FTW weights). |
| **DERIVED** | Computed by FieldShift rules from real inputs. The rule is part of the response or the code. |
| **FARMER** | Typed in by the user and stored. |
| **STATIC** | Constant written in code or a JSON file (reference tables, thresholds, labels). |
| **STUB** | Endpoint or UI that returns fixed text or echoes input. |
| **UNAVAILABLE** | The feature shows an explicit "unavailable" state instead of a number. |

---

## 1. Summary

### 1.1 Overall picture

* The data path has been cleaned of fabricated values. The code and `docs/decisions.md` (D1 to D5) show that synthetic Sentinel-2, pseudo-random POWER precipitation, sine-wave MODIS and "NASA POWER labelled as SMAP/GPM" clients were removed. I found no random or seeded numbers feeding any farmer-facing value in the current runtime path.
* Four pages are honest placeholders (Environmental Profile, Farmer Profile, Scenario Simulator, Reports) and one panel is retired (3D viewer).
* What remains are **mislabels, stale windows, decorative UI and hard-coded display text**. They are listed in section 9 and are the main thing to fix before a demo.
* Several NASA products are **not yet in the local cache** (AppEEARS tasks are still `pending`/`processing`). Features that need them show "unavailable" today. That is correct behaviour, but it means the NASA side of the app is thin right now (section 8).

### 1.2 Feature status at a glance

| # | Feature (route) | Main data behind it | Real data? | Current state |
|---|---|---|---|---|
| 1 | Dashboard (`/dashboard`) | SQLite farms/fields, SoilGrids, Open-Meteo, NASA legacy env cards | Yes, with decorative parts | Works. NASA tab empty until user clicks Fetch. "100 %" DFBK badge and Layers button are not data. |
| 2 | Field Explorer (`/fields`) | DFBK GeoPackage (90,756 blocks), Nominatim, FTW model + Sentinel-2 | Yes | Works. InVeKoS provider is a stub that never returns parcels. |
| 3 | Field Analytics > Field Map | Open-Meteo, SMAP L4 (OPeNDAP), IMERG (OPeNDAP), Sentinel-2 | Yes | Works. Moisture overlay falls to Sentinel-2 NDMI because ECOSTRESS is pending. |
| 4 | Field Analytics > Field Health | SMAP L4/L3, IMERG, Sentinel-2, SoilGrids, Copernicus DEM, Open-Meteo, DWD, farmer inputs | Yes | Works. Nitrogen estimate needs farmer inputs (none saved for Field 2). |
| 5 | Field Analytics > Status | Sentinel-2, NASA POWER, Open-Meteo, farmer planting date | Mostly | Works, but precipitation and GDD charts are fixed to **2024-03-01 to 2024-10-31**. Target yield text is hard-coded. |
| 6 | Field Analytics > Data | Catalog in code, live probes, report cache | Partly | 23 catalogue entries. For a German field: 2 return values (POWER, ERA5), 8 return catalogue metadata only, 11 are US-only (`out_of_coverage`), 2 have no connector. "Upload Data" button only toasts. |
| 7 | Weather (`/weather`) | Open-Meteo, DWD warnings | Yes (model data) | Works. "Virtual station" is a database flag, not a sensor. NDVI layer is cosmetic. |
| 8 | AI Advisor drawer (all pages except AI page) | Gemini 3.5 Flash + context from SQLite, SoilGrids, Open-Meteo, DWD, POWER, legacy SMAP | Yes | Works if `GEMINI_API_KEY` is valid. Context ignores the newer Field Health data. |
| 9 | AI Assistant page (`/ai-assistant`) | Gemini + SQLite conversations | Yes | No sidebar link (URL only). Voice fallback endpoint is a stub. |
| 10 | Crop Planner (`/rotation-studio`) | Sourced crop table, policy JSON, POWER, DEM, IMERG, Sentinel-2, SoilGrids, SMAP L4, ECOSTRESS | Yes | Works. Two of seven signals unavailable (ECOSTRESS, SMAP seasonal pattern). Income not shown. |
| 11 | Environmental Profile (`/environment`) | none | n/a | UNAVAILABLE placeholder page. |
| 12 | Farmer Profile (`/farmer-profile`) | none | n/a | UNAVAILABLE placeholder. Save button only shows a toast. |
| 13 | Scenario Simulator (`/scenario-simulator`) | none | n/a | UNAVAILABLE placeholder. Backend route is a stub. |
| 14 | Reports & Evidence (`/reports`) | none | n/a | UNAVAILABLE placeholder. Backend route is a stub. |
| 15 | Settings / Language / Units | `localStorage` | n/a | Language works (EN/DE). The metric/imperial switch is stored in component state only and nothing reads it. |

---

## 2. Architecture and wiring

### 2.1 Process layout

```
.\run.ps1  (starts both, health-checks, opens browser)
  |
  |-- Vite dev server     http://127.0.0.1:5173   (React 18 + TypeScript + Leaflet + Tailwind)
  |      |  proxy: /api/*  ->  http://127.0.0.1:8000     (vite.config.ts)
  |
  |-- FastAPI (uvicorn)   http://127.0.0.1:8000   app.main:app   title "FieldShift AI API" 0.2.0
         |  CORS: allow all origins/methods/headers
         |  16 routers mounted under /api, plus GET /health
         |  startup hook: AppEEARS background worker (polls every 60 s while tasks are open)
         |
         |-- SQLite  (6 files, section 3)
         |-- Local files: DFBK GeoPackage, SoilGrids GeoTIFF tiles, FTW model weights, Sentinel-2 npz cache
         |-- Outbound HTTP: Open-Meteo, DWD, NASA (POWER, CMR, OPeNDAP, AppEEARS), Element84 STAC + AWS COGs,
                            Copernicus DEM (AWS), ISRIC files, Nominatim, Gemini, USDA/USGS (catalogue probes)
```

* No router framework on the frontend. `App.tsx` keeps `page` in state, initialised from `window.location.pathname`, and calls `history.pushState` on navigation. The Vite dev server provides the SPA fallback.
* `App.tsx` resolves an "active field" once at start: `GET /api/fields`, then picks the first field if the previous one is not in the list. That field id is passed to Analytics, Weather, AI Assistant and Crop Planner.
* `AdvisorDrawer` (floating AI Advisor) is rendered on every page except `/ai-assistant`.

### 2.2 Environment and configuration

| Variable | Used by | Effect |
|---|---|---|
| `EARTHDATA_USERNAME`, `EARTHDATA_PASSWORD` | `nasa/real/appeears.py` (`configured()`) | Required to submit/poll AppEEARS tasks. |
| `EARTHDATA_TOKEN` | `nasa/real/imerg.py`, `nasa/real/smap_l4.py`, `nasa/earthdata_auth.py` | Bearer token for NASA cloud OPeNDAP (IMERG, SMAP L4). Without it these raise "EARTHDATA_TOKEN is not set". |
| `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_ADVISOR_MODEL` | `ai_assistant/gemini_service.py` | Chat and advisor. Default model names in code: `gemini-2.5-flash` (chat), `gemini-3.5-flash` (advisor). `.env` sets `GEMINI_MODEL=gemini-3.5-flash`. |
| `VITE_API_BASE_URL` | `services/apiClient.ts` (used by `fieldAnalyticsApi`, `fieldHealthApi`, `nasaChallengeApi`, `cropPlannerApi`, `CropPlannerView`), `soilApi.ts`, `environmentApi.ts` | If set (`.env` has `http://localhost:8000/api`), those calls go straight to the backend, bypassing the Vite proxy. |
| `VITE_API_BASE` (different name) | `services/boundariesApi.ts` | Not set, so boundaries/farms/fields calls use relative `/api` (proxy) and fall back to `http://127.0.0.1:8000` on error. |

**Wiring inconsistency.** Three base-URL conventions coexist: `apiClient.ts` (`VITE_API_BASE_URL || '/api'`), `boundariesApi.ts` (`VITE_API_BASE` with a hard-coded `127.0.0.1:8000` retry), and several modules with a hard-coded `/api/...` prefix (`weatherApi.ts`, `aiAssistantApi.ts`, `App.tsx`). It works on this machine because the proxy and CORS are both open. A deployed build would need these unified.

### 2.3 Backend router map

| Router prefix (all under `/api`) | File | Backed by | State |
|---|---|---|---|
| `/boundaries/*` | `api/boundaries.py` | DFBK GeoPackage, InVeKoS stub, Nominatim | LOCAL + LIVE (geocode) |
| `/farms`, `/fields`, `/fields/import-boundaries`, `/fields/{id}/geometry`, `/farms/{id}/fields` | `api/farms.py`, `api/fields.py` | `user_farms_fields.db` | FARMER (CRUD) |
| `/fields/{id}/soil*`, `/soilgrids/variables` | `api/soil.py` | SoilGrids tiles | LOCAL + LIVE download |
| `/fields/{id}/environmental*`, `/nasa/datasets` | `api/environment.py` | AppEEARS cache, IMERG OPeNDAP | CACHED / LIVE (legacy pipeline) |
| `/fields/{id}/analytics/*` | `api/field_analytics.py` | Sentinel-2, POWER, DEM, SoilGrids | LIVE + CACHED |
| `/field-health/*` | `api/field_health.py` | SMAP L4, IMERG, Sentinel-2, SoilGrids, Open-Meteo, DWD | LIVE + CACHED + DERIVED |
| `/weather/*` | `api/weather.py` | Open-Meteo, DWD | LIVE |
| `/ai-assistant/*` | `api/ai_assistant.py` | Gemini, SQLite | LIVE |
| `/ai-field-detection/*` | `api/ai_field_detection.py` | Sentinel-2 + FTW-PRUE model | LIVE + LOCAL |
| `/nasa-challenge/*` | `api/nasa_challenge.py` | Catalogue + mixed live probes | Mixed |
| `/crops`, `/policy/*`, `/fields/{id}/planner-inputs|signals|risk-card|score|vulnerability-timeline` | `api/crop_planner.py` | Crop JSON, policy JSON, signals | STATIC + DERIVED |
| `/recommendations/*` | `api/recommendations.py` | Planner | DERIVED |
| `/farmer/preferences`, `/fields/{id}/history`, `/reports/{id}`, `/scenarios/simulate` | `farmer.py`, `fields.py`, `reports.py`, `scenarios.py` | nothing | STUB |

---

## 3. Persistence: databases and files

| Store | Location | Written by | Contents now |
|---|---|---|---|
| `user_farms_fields.db` | `backend/data/` | `user_farms_repository`, `nasa/storage`, `soilgrids/soil_repository` | 1 farm ("Cottbus Farm"), 2 fields (Field 1 6.36 ha, Field 2 12.34 ha, both DFBK imports), 2 soil profiles, 96 soil measurements, 3 NASA dataset definitions, **0 environmental observations**, 0 summaries. |
| `field_analytics.db` | `backend/app/data/` (42 MB) | `field_analytics/repository`, `weather_station_service`, `health/nitrogen` | 661 Sentinel-2 observations (incl. NDVI grids), 6 planting dates, 16 weather caches, 12 report caches, 3 virtual stations, 1 farmer-input row. **Mostly orphaned**: observations and report caches belong to ~13 fields that no longer exist; only Field 1 and Field 2 are current. |
| `nasa_real_data.db` | `backend/app/data/` | `nasa/real/store` | 2,124 point values, 4 AppEEARS tasks (all `pending`/`processing`), 400 IMERG days for one 0.1° cell, 2 rasters (Sentinel-2 indices for each current field). |
| `crop_planner.db` | `backend/app/data/` (gitignored) | `crop_planner/store` | 1 planner-input row (Field 2), 8,036 NASA POWER daily rows (22 point-years, 2 points x 11 years), 2 cached slope signals, 3 saved recommendations. |
| `ai_assistant.db` | `backend/app/data/` | `ai_assistant/db_service` | 21 conversations, 46 messages. |
| `user_farms_fields.db` (empty copy) | `backend/app/data/` | none | 0 bytes. Dead file. The live one is in `backend/data/`. |
| `dfbk_agricultural.gpkg` | `backend/data/` (155 MB, gitignored) | `scripts/preprocess_dfbk.py` | Brandenburg agricultural field blocks (metadata says 90,756 records, 1,327,878 ha, version 2026). |
| `soilgrids/tiles/*` | `backend/data/soilgrids/` | `soilgrids/client` | 8 properties x depth tiles (GeoTIFF) for Brandenburg tile set. |
| `satellite_cache/*.npz` | `backend/data/` | `field_segmentation/satellite_service` | 3 cached 256x256 Sentinel-2 chips (two Brandenburg, one India). |
| Model weights | `backend/models/field_segmentation/` | downloaded | `ftw-prue/prue_efnetb3_ccby-b35d59a6.pth` (active), `ftp-b3/model.safetensors`, legacy `best_model.pth`/`last_model.pth`. |
| Reference JSON | `backend/app/data/*.json` | `scripts/build_crop_profiles.py` and hand-edited | `crop_profiles.json` (11 crops, 6 scoring-eligible, 82 attributes, 32 flagged `verify`), `policy_rules.json`, `scoring_weights.json`, `soil_reference.json`. |

Two separate DATA_DIR resolutions explain the split: modules under `services/` directly (`user_farms_repository`, `nasa/storage`, `soilgrids`) write to `backend/data/`; modules one level deeper (`field_analytics`, `nasa/real`, `crop_planner`, `ai_assistant`) write to `backend/app/data/`.

---

## 4. External data sources

| Source | Endpoint / product | Used for | Auth | Access pattern |
|---|---|---|---|---|
| Open-Meteo forecast API | `api.open-meteo.com/v1/forecast` | Current weather, hourly 24 h, daily up to 16 days, soil temperature 0-7 cm and 7-28 cm, ET0, past precipitation, forecast for leaching/seeding window | none | LIVE, 8-10 s timeout, no cache in weather service |
| DWD | `dwd.de/DWD/warnungen/warnapp/json/warnings.json`, GeoServer WFS `maps.dwd.de/geoserver/dwd/ows` (layer `dwd:Warngebiete_Kreise`) | Official warnings by Kreis | none | LIVE, warnings cached 5 min, warn-cell lookup cached 30 days; Germany bounding box only |
| NASA POWER daily | `power.larc.nasa.gov/api/temporal/daily/point` | Precipitation (`PRECTOTCORR`), `T2M`, `T2M_MIN/MAX`, `EVLAND` for GDD, planner climate, challenge probe | none | LIVE then cached (planner: per year in SQLite; analytics: per field) |
| NASA GPM IMERG Late (`GPM_3IMERGDL.07`) | CMR + `opendap.earthdata.nasa.gov` (collection `C2723754859-GES_DISC`) | Daily rain, days since rain, heavy-rain days | `EARTHDATA_TOKEN` | One-cell subset per day, 8 parallel workers, cached per cell and day |
| NASA SMAP L4 (`SPL4SMGP.008`) | CMR + OPeNDAP (`C3480440870-NSIDC_CPRD`) and AppEEARS | Root-zone and surface moisture, percentile vs 2016 to last year | token / Earthdata login | 10:30 UTC granule per day via OPeNDAP, cached in `point_values` |
| NASA SMAP L3 Enhanced (`SPL3SMP_E.006`) | AppEEARS point task | Measured surface moisture (AM/PM pass), quality filtered | Earthdata login | Async task, background poll |
| NASA MODIS `MOD13Q1.061` | AppEEARS point task | 250 m NDVI (legacy environmental card) | Earthdata login | Async task. **No rows stored today.** |
| NASA ECOSTRESS `ECO_L4T_ESI.002` | AppEEARS area task | 70 m evaporative stress map | Earthdata login | Async task. **Pending.** |
| Sentinel-2 L2A | Element84 Earth Search STAC `earth-search.aws.element84.com/v1/search` + COG assets on AWS | NDVI time series, NDMI/NDRE overlays, soil brightness, field-boundary detection input | none | Windowed COG reads (rasterio), 6 scenes in parallel |
| Copernicus DEM GLO-30 | `copernicus-dem-30m.s3.amazonaws.com` | Elevation, slope | none | COG read per tile |
| ISRIC SoilGrids v2.0 | `files.isric.org/soilgrids/latest/data` | Sand/silt/clay, pH, SOC, CEC, bulk density, N for 6 depths | none | Tile download then local raster extraction; tile list hard-coded for Brandenburg |
| DFBK (Digitales Feldblockkataster) | `data.geobasis-bb.de/.../dfbk.zip` | Official field blocks | none | One-time download, preprocessed to GeoPackage |
| InVeKoS WFS | `inspire.brandenburg.de/services/elu_antrag_ap_wfs` | Secondary parcels | none | Only a GetCapabilities check is implemented |
| Nominatim (OSM) | `nominatim.openstreetmap.org` | Geocoding (backend, cached 24 h, 1.1 s spacing) and reverse geocoding (browser direct) | none | LIVE |
| Esri World Imagery tiles | `server.arcgisonline.com/.../World_Imagery` | Base map on every map | none | Browser tiles |
| Google Gemini | `generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` | AI chat and advisor | `GEMINI_API_KEY` | LIVE, model fallback list |
| Hugging Face `fieldsoftheworld/ftw-prue-ccby` | model weights | Field-boundary segmentation | none | Downloaded once |
| Challenge probes: USDA CropScape, USDA Soil Data Access, ERA5 (Open-Meteo archive), USGS NWIS, NASA CMR | various | Data tab queries | none | LIVE on click |
| Reference documents (not APIs) | FAO EcoCrop, Sacks et al. 2010 crop calendar, DüV Anlage 4, FAO-56 T19/T22, LfL Bayern, BZL, TLL, Landwirtschaftskammer NRW (GLÖZ 7), MLEUV Brandenburg (ÖR 2) | Crop table and policy rules | n/a | Copied into JSON with source key, reference and `verify` flag per attribute |

---

## 5. Frontend structure

### 5.1 Navigation and shell

| Component | Role | Data |
|---|---|---|
| `App.tsx` | Page switch, toast, active field resolution, placeholder pages (Environment, Farmer Profile, Scenarios, Reports) | `GET /api/fields` once |
| `shell/Sidebar.tsx` -> `layout/FloatingSidebar` | Left navigation, settings, help, profile | `NAV_ITEMS` constant (9 items) |
| `layout/SidebarUserProfile` | Shows **"Jonas Schmidt / Farm manager"** from i18n strings, avatar "JS". Also hard-coded in the top bar | **STATIC (fake identity)** |
| `common/SettingsModal` | Language switch (works), unit toggle (state only, nothing consumes it) | `localStorage` for language |
| `i18n/*` | EN and DE dictionaries, number/date/hectare formatting | static strings |
| `common/MapSearchBar`, `services/geocodingService` | Unified search: saved fields, farms, built-in Brandenburg gazetteer (30 places), 2 Indian test regions, coordinate parsing, backend geocode for postal codes | gazetteer STATIC, geocode LIVE |
| `common/MapLegend` | Legend for dashboard/explorer | static |
| `common/LanguageSwitcher` | EN/DE toggle in AI, Explorer, Weather | `localStorage` |
| `common/LanguageSelectModal`, `layout/*` pieces | `LanguageSelectModal` is not imported anywhere (dead). Others are layout only. | none |

The sidebar has **no entry for `/ai-assistant`**. That page is reachable by typing the URL; the floating Advisor drawer is the normal entry point.

### 5.2 Frontend API modules and who uses them

| Module | Calls | Used by |
|---|---|---|
| `boundariesApi.ts` | `/api/boundaries/*`, `/api/farms*`, `/api/fields*`, `/api/ai-field-detection/*` | Dashboard, Field Explorer, Analytics workspace/header, MapSearchBar |
| `weatherApi.ts` | `/api/weather/*` | Dashboard (regional card + station markers), Weather page |
| `soilApi.ts` | `/api/fields/{id}/soil*` | Dashboard `FieldSoilCard` |
| `environmentApi.ts` | `/api/fields/{id}/environmental*` | Dashboard `FieldEnvironmentalCard` |
| `fieldAnalyticsApi.ts` | `/api/fields/{id}/analytics/*` | Analytics workspace, Status, Data, Header |
| `fieldHealthApi.ts` | `/api/field-health/*` | Field Map and Field Health tabs |
| `nasaChallengeApi.ts` | `/api/nasa-challenge/*` | Data tab |
| `cropPlannerApi.ts` | `/api/fields/{id}/risk-card|planner-inputs|vulnerability-timeline`, `/api/recommendations/generate` | Crop Planner |
| `ai-assistant/aiAssistantApi.ts` | `/api/ai-assistant/*` | AI page, Advisor drawer, Voice bar |
| `geocodingService.ts` | `/api/boundaries/geocode`, Nominatim reverse (direct from browser) | Search bar, Dashboard |
| **`farmsApi.ts`, `fieldsApi.ts`, `farmerApi.ts`, `recommendationsApi.ts`, `reportsApi.ts`, `scenariosApi.ts`, `types/index.ts`** | Original scaffold contracts | **Imported by nothing.** Dead code. `recommendationsApi.compare` calls a route that does not exist. |

`package.json` still lists `@supabase/supabase-js` and `three` although nothing imports them (the 3D viewer was retired).

---

## 6. Feature-by-feature wiring

### 6.1 Dashboard (`/dashboard`) - `components/dashboard/Dashboard.tsx` (1,566 lines)

Wiring on load (`loadData`): `GET /api/farms`, `GET /api/fields[?farm_id]`, `GET /api/weather/fields` (errors swallowed).

| Block | Source | Tag | Logic and notes |
|---|---|---|---|
| Farm selector, add/delete farm, add/edit/delete field | `/api/farms`, `/api/fields` -> `user_farms_fields.db` | FARMER | Durable SQLite. Deleting a farm cascades to fields. |
| "Saved fields / Total area / Crops / Average size" | Computed in the browser from the field list | DERIVED | |
| **"DFBK Status 100 % / Sync Durable"** and **"Verified Records"** badge | Literal text in the component | **STATIC** | Not tied to any health check. Always shows 100 %. |
| Regional Climate & Weather card | `GET /api/weather/point?lat&lon` (Open-Meteo) + browser reverse geocode (Nominatim). Starts at **Potsdam (52.415, 13.045)** until GPS is granted. | LIVE | Browser geolocation replaces the default. With GPS denied the location label is "Potsdam, Brandenburg" while the user's fields may be in Cottbus. On a failed fetch the card shows "--"; no placeholder values. |
| Map | Esri World Imagery tiles + saved-field polygons (`GeoJSON`) + virtual-station markers from `/api/weather/fields` | LOCAL/LIVE | Selected field orange, others green. |
| **Layers button** (NDVI/moisture/rainfall/temperature) | `layers` state defined, `layersOpen` toggles, **no panel and no layer is rendered** | **STUB (dead UI)** | Button does nothing visible. |
| Field card tab "SoilGrids" (`FieldSoilCard`) | `GET /api/fields/{id}/soil`, `POST .../soil/extract|refresh` | LOCAL + CACHED | Topsoil composite 0-30 cm (depth-weighted 5/30, 10/30, 15/30) plus six depth layers. USDA texture class, pH, SOC, bulk density, CEC, N. Field 2: Sandy Loam (75/16.4/8.5), pH 6.2, SOC 2.66 %. Subpixel fields get a resolution warning. |
| Field card tab "NASA Satellites" (`FieldEnvironmentalCard`) | `GET /api/fields/{id}/environmental`, `POST .../extract|refresh` | CACHED/LIVE (legacy pipeline) | See 6.1.1. Currently empty until the user presses "Fetch NASA Environmental Data". |
| Field card tab "Field Info" | Field record | FARMER/LOCAL | Area, crop, boundary source (DFBK or user-drawn), boundary id, land-use category, attribution. |

#### 6.1.1 Legacy NASA environmental pipeline (`services/nasa/*`)

Flow: `POST /fields/{id}/environmental/extract` -> `NasaEnvironmentalService.extract_field_environmental_data` -> three clients -> `field_environmental_observations` + summaries -> `GET .../environmental` builds SMAP / GPM / MODIS reports.

| Dataset | What the client really does | Quality filters |
|---|---|---|
| SMAP | `series.ensure_point_data` (may queue an AppEEARS point task, never blocks) then reads cached L3E values from `point_values`. | Keeps retrievals with quality-flag bit 0 = 0 and 0.02-0.60 m³/m³. AM and PM passes averaged per day. |
| GPM | `imerg.daily_precipitation` (OPeNDAP, per-day cell subset). | Fill and negative values dropped. |
| MODIS | Reads cached `MOD13Q1` NDVI from `point_values`. | Pixel reliability 0 or 1 only. |

Findings on this pipeline:

* **Product mislabel.** `environmental_datasets` and `GpmFieldReport.product_run` say "GPM_3IMERGDF.07 Final run", but the data are **IMERG Late** (`GPM_3IMERGDL.07`, satellite-only, not gauge-corrected). The observation's own `quality_status` string does say "IMERG Late", so the card contradicts itself.
* `ModisFieldReport.valid_coverage_pct` and each observation's `coverage_percentage` are hard-coded to 100.
* `field_environmental_observations` has **0 rows**; MODIS has no rows in `point_values`; the Field 2 point task (`9965e879...`) is `processing`. Result today: `GET /fields/field-2bf954950c/environmental` returns three empty reports (SMAP 0, GPM 0, MODIS 0 observations).
* The extractor/processor modules `smap/extractor.py`, `gpm/extractor.py`, `modis/extractor.py` and the CMR granule download methods in the three clients are imported but never called by the current flow (leftover from the pre-AppEEARS design).
* `GET /fields/{id}/environment` is a backward-compatibility alias of the same data.

### 6.2 Field Explorer (`/fields`) - `components/fields/FieldExplorerView.tsx` (1,924 lines)

| Capability | Wiring | Tag | Logic |
|---|---|---|---|
| Boundary discovery in viewport | `GET /api/boundaries/viewport` (west/south/east/north, category, `limit=1000`, zoom) -> `dfbk_service.get_boundaries_in_viewport` | LOCAL | `pyogrio` bbox query on `dfbk_agricultural.gpkg`. Counts matches first, reads up to 5,000, then returns the `limit` blocks closest to the view centre and reports `truncated`. Rejects boxes wider than 3°. Geometry simplified when zoom < 14. Debounced 250 ms. |
| Nearby, search by place | `/api/boundaries/nearby`, `/search` | LOCAL | Radius query around a point or around a municipality from `BRANDENBURG_MUNICIPALITIES` (19 entries in the backend, 30 in the frontend; two separate hard-coded lists). |
| Postal code / place search | `/api/boundaries/geocode` -> Nominatim (`countrycodes=de`) | LIVE | 24 h in-memory cache, 1.1 s spacing. 503 if Nominatim is down. |
| Locate me | Browser geolocation, high accuracy then network fix | LIVE | Warns when accuracy is > 5 km or the location is outside Brandenburg. |
| Provider status | `/api/boundaries/status` | STATIC + LIVE | DFBK counts come from `dfbk_metadata.json`. `wfs_status` is the **literal string** "offline (HTTP 500 - using local cached spatial index)". InVeKoS status is a live GetCapabilities check. |
| **InVeKoS source** | `invekos_service.get_boundaries_in_viewport` | **STUB** | Returns an empty FeatureCollection whether online or offline. Reports "online" but never provides parcels. |
| Import selected blocks | `POST /api/fields/import-boundaries` | FARMER + LOCAL | Copies the DFBK geometry, keeps the original, stores `official_net_ha`. Creates the farm if it does not exist. |
| Draw custom field / edit geometry | `POST /api/fields`, `POST /api/fields/{id}/geometry` | FARMER | Area recalculated in EPSG:25833. |
| **AI field scan** (outside Brandenburg, or any area) | `POST /api/ai-field-detection/scan` then poll `/jobs/{id}`, `/jobs/{id}/predictions`, cancel | LIVE + LOCAL | See 6.2.1. |

#### 6.2.1 AI field detection

Pipeline (`field_segmentation/service.py`): one background thread per job -> `Sentinel2AcquisitionService.acquire_scene_for_bbox` (STAC search, lowest cloud cover, 256x256 chip read from COGs; cached as `.npz`) -> `FieldInferenceEngine` (Fields of the World FTW-PRUE+ EfficientNet-B3 U-Net, CPU) -> polygonisation (watershed on predicted interior/boundary) -> GeoJSON. Jobs live in memory (`self.jobs`), so they vanish on restart.

| Check | Result |
|---|---|
| Imagery | Real Sentinel-2 only. The synthetic reflectance fallback was removed; on failure the job fails. |
| Model | Pretrained FTW weights, loaded from `backend/models/field_segmentation/ftw-prue/`. If loading fails the engine silently drops to the weak legacy MobileNetV3 U-Net (mean IoU 0.23; `active_architecture` then says "(Fallback)"). |
| **Input hack** | FTW expects two dates (8 channels). `prepare_ftw_tensor` stacks the **same single image twice**. Documented in code, but it means the model is run outside its trained input regime. |
| **Misleading metrics** | `GET /model/status` reports `validation_metrics` from `metrics.json` (mean IoU 0.2265, boundary F1 0.03). Those belong to the **legacy locally trained MobileNetV3 model**, not to the active FTW weights. The page advertises "ftw-prue-v3.1" next to metrics of another model. |
| Region labelling | `is_brandenburg` and `is_umred` are crude bounding tests on the west/south corner; everything else is "External Region" and flagged `experimental`. |
| Hard-coded status | `geographic_validation` text ("Calibrated against Brandenburg DFBK official reference boundaries") is a literal, not a measured result. `parameters_count` falls back to 13,161,123 if the model is missing. |

### 6.3 Field Analytics workspace (`/analytics`)

`FieldAnalyticsWorkspace` loads Summary, NDVI batch 1 (20 newest), Precipitation and GDD with a single `Promise.all`, unblocks the UI, then loads the full report in the background and streams the remaining NDVI batches (20 per call). The default tab is **Field Map**. **If the precipitation or GDD call fails, the whole workspace shows "Unable to Load Field Analytics"**, because the four requests are not isolated.

#### 6.3.1 Field Map tab (`health/FieldMapTab.tsx`)

| Element | Endpoint | Source | Tag | Logic |
|---|---|---|---|---|
| All fields coloured moist/medium/dry | `GET /field-health/map` | SMAP L4 root zone | LIVE+CACHED, modelled | `risks.moisture_status`: reads today's value of the 9 km cell, ranks it against all 10:30 UTC snapshots of the same cell within ±15 days of the date in 2016..last year. `< 20th percentile` red, `20-40` yellow, `>= 40` green (US Drought Monitor D1 analogy). Needs at least 100 climatology samples. Each field's moisture also triggers on-demand OPeNDAP fetches (up to ~10 years x 31 days) the first time it is requested. Provenance "modelled" (L4 assimilates SMAP). |
| "Days since rain" per field | same | NASA GPM IMERG Late | CACHED | Days since last day with ≥ 1 mm in the 0.1° cell. |
| Field card | `GET /field-health/fields/{id}/card` | Aggregates moisture, rain, soil health, nitrogen estimate, weather | DERIVED | Cached in memory for 10 min (soil 24 h). |
| Overlay: Moisture | `/field-health/fields/{id}/overlay/moisture` | ECOSTRESS ESI 70 m if a recent overpass has ≥ 60 % valid pixels, else Sentinel-2 NDMI 20 m | OBSERVED / satellite estimate | Currently **Sentinel-2 NDMI** (scene S2C_33UVT_20261113); ECOSTRESS task is pending. NDMI on a bare field is flagged as "dry soil surface, not plant stress". |
| Overlay: Nitrogen | `.../overlay/nitrogen` | Sentinel-2 red-edge NDRE (B8A, B05) | OBSERVED | Split into thirds **within the field** (relative, not kg N). Shown only when field mean NDVI ≥ 0.4 (active canopy). |
| Overlay: Leaching | `.../overlay/leaching` | Whole-field rule from SoilGrids and forecast | DERIVED | Whole field one colour because SoilGrids is 250 m. |
| Links | to Health tab, Crop Planner, Reports | | | |

#### 6.3.2 Field Health tab (`health/FieldHealthTab.tsx`) - `GET /field-health/fields/{id}/trend`

| Panel | Source | Tag | Logic |
|---|---|---|---|
| Action cards ("What to do") | Rule engine `service._actions` over the panels below | DERIVED | Each card lists its evidence. Today for Field 2: soil drier than usual, DWD frost warning, moderate wind erosion, DüV blocking period. |
| Vegetation trend (3 years) | Stored Sentinel-2 NDVI (`field_analytics.db`) | OBSERVED + DERIVED | Cloud-free scenes with ≥ 60 % valid pixels since `DEFAULT_HISTORY_START` (3 years before the current year). Per season the highest April-July value; linear fit across seasons; `|slope| <= 0.02 NDVI/yr` = stable. Field 2: 57 scenes, peaks 0.78/0.68/0.77/0.77, "stable". |
| Soil moisture, 30 days | SMAP L4 (modelled) and SMAP L3 (measured, filtered) | MODELLED/MEASURED | Event text for ≥ 0.02 m³/m³ change and 3-day rises ≥ 0.015. Usual range p10/median/p90 from the same climatology. |
| Yield zones | Stored NDVI grids -> `productivity_service` with `min_seasons=2` | DERIVED | Per-season percentile rank of each pixel, averaged and penalised by missing seasons, split into **terciles**. Because it is a tercile split, the three zone areas are always about equal (4.1 ha / 4.1 ha / 4.1 ha for Field 2). Labelled relative productivity, not yield. Uses a crop-agnostic May-August window when no crop is set. |
| Erosion risk | DEM slope, SoilGrids sand/silt/SOC, IMERG heavy-rain days (≥ 20 mm), Sentinel-2 bare-soil share (NDVI < 0.25) | DERIVED | Points per factor; the larger of water and wind totals sets the light (0-1 green, 2 yellow, ≥ 3 red). Described in the response as a screening rule, not DIN 19708. |
| Leaching risk | SoilGrids (sand ≥ 50 %/70 %, CEC < 100), Open-Meteo 3-day rain, IMERG recent rain, farmer's last N date | DERIVED | Red if ≥ 20 mm rain since or forecast within 14 days after an N application on vulnerable soil. DüV blocking-period reminder in October to January. |
| Cover-crop seeding window | Open-Meteo 72 h soil temperature and rain | MODELLED | Open if mean 0-7 cm soil temp ≥ 8 °C and rain < 20 mm. |
| Soil health score (card) | SoilGrids topsoil | DERIVED | Equal-weight mean of four linear scores (pH, SOC, CEC, bulk density). Field 2 = 97 "good". Labelled FieldShift indicator. |
| Nitrogen requirement | Farmer inputs (crop, yield target, Nmin, previous crop, organic N, last application) + DüV constants in code | DERIVED + FARMER | "Not available" until crop, yield target and Nmin are saved. Table values are typed from DüV Anlage 4 into `nitrogen.py`. Humus from SoilGrids SOC x 1.72. Red-zone reduction **not applied** and the response says so. |
| Weather panel | `weather_station_service` (Open-Meteo + DWD) | MODELLED/LIVE | Uses the full forecast function and trims it. |

Current-state note for Field 2: moisture percentile is **0.0** on 2026-11-10 (root-zone value below every one of the same-season climatology samples), so the field is red. This is what the algorithm outputs; it is an extreme result worth sanity-checking against the stored L4 values before presenting it.

#### 6.3.3 Status tab (`StatusTab.tsx`, 811 lines)

| Element | Source | Tag | Notes |
|---|---|---|---|
| Crop, area, farm | field record | FARMER | |
| Planting date | `PUT /analytics/planting-date` -> `field_planting_dates` | FARMER | Field 2 currently has 2026-11-15 (entered today), so the UI shows "0 days since emergence". |
| **Target yield text** ("7.5 t/ha expected", "6.8", "6.0", "5.2 DM", "3.6", "4.0", "9.5", default "6.2") | Literal `if` chain in the component, keyed on crop name | **STATIC / illustrative** | Not sourced and not computed. Contradicts the decision log (D1: no hard-coded values a farmer reads). Not visible for Field 2 because no crop is assigned. |
| Rotational group, seeding season | keyword match on crop name, month of planting date | DERIVED | |
| Current weather | `weather_service.get_current_weather` (Open-Meteo, 3 s timeout) | LIVE/MODELLED | Source string "Open-Meteo forecast grid". `is_forecast: true`. Returns "unavailable" on timeout. |
| Sentinel-2 NDVI series, scene browser, RGB/NDVI previews, include/exclude toggle | `GET /analytics/ndvi` (batches), toggle -> `POST /observations/{id}/toggle` | OBSERVED | Real scenes with SCL cloud mask, 10 m grid, `valid_pixel_percent ≥ 30` to be stored. 57 scenes for Field 2. Cold build is 1.5 to 9 minutes (decision D12). |
| **Precipitation chart and total** | `GET /analytics/weather` -> NASA POWER `PRECTOTCORR` | LIVE then cached per field | **Window hard-coded in `weather_service.py` to `2024-03-01..2024-10-31`.** Current response: 399.0 mm for 2024. It is a past season shown in a 2026 workspace. The cache is keyed by field only, ignoring dates. The `data_source` string says "GPM/MERRA-2 PRECTOTCORR" (POWER corrected precipitation); the 0.5° resolution label is correct. |
| **GDD chart and total** | `GET /analytics/gdd?base_temp=` -> POWER `T2M_MIN/MAX` | LIVE | Same fixed 2024 window (2,833.9 GDD at base 4.4 °C). Formula `max(0, (Tmax+Tmin)/2 − Tbase)`. Base temperatures from a code table by crop name, or the user's choice (4.4 default in the UI). |

#### 6.3.4 Data tab (`DataCatalogTab.tsx`)

| Element | Source | Tag | Notes |
|---|---|---|---|
| "NASA Challenge Catalogue (23)" | `GET /nasa-challenge/catalog` -> `catalog.py` dict | STATIC | Metadata (name, agency, URL, description, use for rotation) for 23 sources. |
| "Query for Field" / "Query Core Sources" | `GET|POST /nasa-challenge/fields/{id}/query`, `/probe-all` | LIVE | Uses the field centroid. See table below. |
| "Field Operational Layers" | Built in the browser from the NDVI list and the full report | DERIVED | Only lists a layer when its backing data exists (NDVI, SoilGrids, soil brightness, DEM). Honest. |
| "Upload Data" button | Only calls `notify("Upload data dialog opened ... Select Shapefile, ISO-XML, or GeoTIFF")`. No dialog, no upload route. | **STUB with a misleading toast** | |

Live connectors in `nasa_challenge/client.py`:

| Dataset id | Behaviour | Result type |
|---|---|---|
| `cropscape_cdl`, `web_soil_survey`, `prism_climate`, `naip_imagery`, `usgs_nlcd`, `cocorahs`, `usgs_nwis`, `usda_ams_market_news`, `usda_nass_quickstats`, `openet`, `usfs_landfire` | Contiguous-US only. Outside it: `out_of_coverage`. | Field 2 is in Germany, so all return `out_of_coverage`. |
| `nasa_power`, `era5_reanalysis` | Real daily series for the centroid | `success` |
| `smap`, `gpm_imerg`, `landsat_modis_viirs`, `srtm`, `ecostress`, `nldas_gldas`, `gedi_lidar` | CMR granule **search only** | `metadata_only` ("Science values were not extracted") |
| `copernicus_sentinel2` | STAC search, last 30 days | `metadata_only` |
| Everything else (e.g. `fao_gaez`, `usda_ag_data_commons`) | No connector | `unavailable` |

Note: `nldas_gldas` is mapped to short name `GLDAS_NOAH025_3H` in the client while the catalogue URL references `NLDAS_NOAH0125_H`; they are different products.

### 6.4 Weather page (`/weather`) - `components/weather/WeatherView.tsx` (1,399 lines)

Endpoints: `GET /weather/available-fields`, `/weather/fields`, `/weather/fields/{id}`, `POST/DELETE /weather/stations/{id}`, `DELETE /weather/stations`.

| Block | Source | Tag | Logic and caveats |
|---|---|---|---|
| Current conditions, 24 h hourly | Open-Meteo `current` + `hourly` for the **field centroid** (mean of polygon ring vertices) | LIVE, modelled | Required values missing -> `WeatherUnavailable` -> HTTP 503 -> UI banner "Live weather is currently unavailable... No placeholder values are shown." |
| 7-day daily and "monthly" outlook | Open-Meteo `daily`, `forecast_days=16` | LIVE, modelled | The "Monthly" tab is a **16-day model outlook** (two full 7-day blocks plus a 15-16 day trend), not a month. Weekly GDD uses base 5 °C hard-coded. |
| DWD warnings | DWD warnings JSON + WFS point-in-polygon (Kreis) | LIVE | Text is the official German text. Germany bounding box only; otherwise `available=false` with reason. |
| Spraying windows and "spray safe" days | Rules in browser (wind > 6 m/s or rain > 0.4 mm unsuitable; wind > 4.5 or rain > 0.1 caution) and in backend (`_is_spray_safe`: rain < 0.4 mm and wind ≤ 6 m/s) | DERIVED | Two similar but separate rule sets (hourly in UI, daily in API). |
| "Radar Rain" frames | `_generate_radar_timeline`: past 2 h model precipitation + now + next 4 h forecast | MODELLED | **Not radar.** It is Open-Meteo hourly precipitation relabelled "Radar Rain". |
| "Incoming clouds" card | `_calculate_incoming_clouds` | DERIVED heuristic | Text like "Clouds in ~N min" is computed from forecast cloud cover (`(next hour − now) × 2`, clamped 20-60). It is a guess presented as an arrival time. If no forecast exists it returns "No significant clouds incoming" with peak 20 %. |
| Virtual weather station | `virtual_weather_stations` table (field id, centroid, name, active flag). Metadata `{"model": "vStation-Pro AgriMesh", "sensors": [...]}` is written on creation | **STUB-like** | There is no hardware and no telemetry. A station is a switch that makes the field appear in `/weather/fields`. The "AgriMesh" model name and sensor list are decorative. The numbers shown are Open-Meteo model values for that coordinate. Leaf-wetness risk is a two-line rule (humidity > 75 % or rain > 0.2 mm). |
| Sun elevation (sent as `threejs_simulation`) | `_estimate_sun_elevation`: `max(0, 90 − |lat − 23.5| − 7.5·|hour − 12.5|)` | DERIVED crude | Not astronomical; uses local clock hour. Consumed by nothing now. |
| `threejs_simulation` params, `ThreeSatelliteViewer` | Cloud density, wind vector, etc. computed in backend | | The viewer is retired and shows "3D field surface unavailable". The params are still computed and sent. |
| **NDVI layer toggle** | UI only | **Cosmetic** | Selecting NDVI repaints polygons with one fixed green (`#16a34a`, 45 % opacity) and shows an NDVI colour bar. No NDVI data is requested or drawn. |
| Station markers on map | `/weather/fields` | LIVE | Fields whose Open-Meteo call fails are silently omitted. |

DB state: three stations exist (Fields `b543dcb192`, `3a860dfdb7`, `2bf954950c`); only `2bf954950c` still has a field record, so `/weather/fields` returns one station (0.6 °C at the time of probing).

### 6.5 AI Advisor drawer and AI Assistant page

Common backend (`api/ai_assistant.py` + `services/ai_assistant/*`):

1. User picks a field (or "All fields" / "General question"), then a topic (crop, field, soil, fertilizer; the drawer also has "any").
2. `POST /api/ai-assistant/chat` stores the user message in `ai_assistant.db`, builds a text context from live/cached platform data, sends system instruction + context + last 10 turns (+ images, base64) to Gemini, sanitises the reply (strips LaTeX, deep headings, field ids, filler openings), stores the answer and returns `grounded_data` (sources and unavailable items).
3. Model candidates tried in order (chat): `GEMINI_MODEL`, `gemini-3.5-flash`, `gemini-3.1-flash-lite`, `gemini-flash-latest`, `gemini-3.8-flash`. Advisor: `GEMINI_ADVISOR_MODEL` (default `gemini-3.5-flash`), `gemini-3.8-flash`, `gemini-flash-latest`. A connection error or timeout ends the loop.
4. If Gemini is unreachable or no key is set, the reply is a fixed message: "The AI service is unavailable... No fallback diagnosis or field measurements were generated." plus "Sources: none". The earlier canned agronomic fallback is disabled.

| Context type | Built by | Includes | Missing |
|---|---|---|---|
| Field / crop / soil / fertilizer (AI page) | `context_builder._build_field_context` | Saved area/crop/boundary, SoilGrids topsoil, 5 newest Sentinel-2 NDVI values, current weather | Everything else (moisture, rain, erosion, planner). Always states legal N need and red zone as NOT AVAILABLE. |
| Advisor (drawer) | `advisor_context.build` | Field record, SoilGrids texture/pH/SOC, **legacy** SMAP table (`field_environmental_observations`), Open-Meteo current + 7-day rain/frost, DWD warnings, days since ≥ 1 mm rain (Open-Meteo past 14 days), POWER GDD and frost nights from 1 January | SMAP L4 percentile, IMERG, NDVI trend, erosion, leaching, crop planner. |
| All fields | `_build_all_fields_context` / `_build_all` | Name, area, crop, soil texture per field (max 12 for advisor) | Weather and moisture |
| General | fixed text | Regional statement ("mostly sandy, 500-620 mm, early-summer drought risk") | |

Findings:

* With the legacy SMAP table empty, the Advisor lists "SMAP soil moisture (no observations stored for this field)" as unavailable even though the Field Health tab has live SMAP L4 data for the same field. The two NASA paths are not connected to each other.
* The Advisor tells the model "legal nitrogen ceiling ... policy engine not built yet", but the repository now has a DüV/GLÖZ 7/ÖR 2 engine in `services/policy` and `crop_planner`.
* The AI page header always shows "Gemini 3.5 Flash" (UI default) regardless of which model answered; the reply's `model` field is used only if present.
* **Voice input.** The browser's `SpeechRecognition` is used when available. Otherwise `VoiceInputBar` records audio and posts it to `POST /api/ai-assistant/voice`, which returns the fixed text **"Voice audio received successfully."** with no transcription. That string would be placed in the input box as if it were the user's speech.
* AI page has no sidebar link; conversation history, DE/EN, image upload (≤ 4 MB for the drawer: jpeg/png/webp) work.
* Conversations are global (no user separation).

### 6.6 Crop Planner (`/rotation-studio`) - `components/crop-planner/*`, `services/crop_planner/*`, `services/policy/*`

Flow: field -> risk card (`GET /fields/{id}/risk-card`) and saved inputs (`GET /fields/{id}/planner-inputs`). The farmer enters 2-3 years of main crops, soil texture, top priority and irrigation (`PUT .../planner-inputs`, stored in `crop_planner.db`). "Generate" calls `POST /recommendations/generate`, which returns three five-year strategies (A current path, B resilience/soil building, C diversified), a vulnerability timeline and nutrient plan.

**Signals** (`crop_planner/signals.py`, all provenance-tagged `live` / `cached` / `unavailable`; failed live fetch falls back to the last real stored observation, never to a default):

| Signal | Source | Field 2 today |
|---|---|---|
| `slope` | Copernicus DEM 30 m | cached (mean 1.59°, max 15.9°) |
| `rain_extremes` | IMERG Late, heavy-rain days ≥ 20 mm in 12 months (needs ≥ 80 % of 365 days stored) | cached |
| `bare_soil` | Sentinel-2 NDVI < 0.25 days per year, linear interpolation between clear scenes, gaps > 45 days not counted | cached |
| `evaporative_stress` | ECOSTRESS ESI summer mean | **unavailable** (task pending) |
| `root_zone_moisture` | SMAP L4 monthly mean pattern (needs ≥ 5 days in all 12 months) | **unavailable**: only the ±15-day windows around the current date were fetched for this point, so only two months have data. Needs the AppEEARS full-history task (processing). |
| `soil` | SoilGrids by depth, USDA class, plant-available water via FAO-56 Table 19 midpoints | cached |
| `climate` | NASA POWER, last 10 complete years + the prior autumn (≥ 5 years required) | cached |

**Scoring** (`scoring.py`): four axes (water resilience, soil cover, nitrogen balance, heat tolerance), each `100 × Σ(wᵢ·fᵢ)/Σwᵢ` over factors in [0,1]. Weights are in `scoring_weights.json`, which declares itself "MODEL PARAMETERS, not field data" (design choices). Missing required inputs make an axis "not scored"; missing optional inputs renormalise weights and list the gap. Priority selects axis weights (e.g. `reduce_nitrogen`: water 0.2, soil cover 0.2, nitrogen 0.4, heat 0.2).

**Rotation generator** (`generator.py`, `rotation.py`): enumerates 5-year sequences over scoring-eligible crops (6 of 11 in the table: winter wheat, winter barley, winter rapeseed, sugar beet, faba bean, field pea; the other five lack a sourced attribute the scorer requires). Hard filters: GLÖZ 7 (≥ 2 distinct main crops in 3 years), calendar feasibility (predecessor median harvest + 14-day seedbed gap before successor sowing, from Sacks 2010 windows) and sourced rest periods for grain legumes. Wheat rest is a soft penalty. Farm-level quota and ÖR 2 are evaluated only when all fields' crops are known.

**Policy** (`policy/gloez.py`, `dbe.py`, `cap.py`): values come from `policy_rules.json`, each with source URL, retrieval date (2026-11-15) and `verify` flag. DüV Anlage 4 requirement is computed from the farmer's inputs; missing 5-year yield, Nmin and humus are shown as "not applied". Red-zone status is not known.

**Crop table**: `crop_profiles.json`, generated by `scripts/build_crop_profiles.py` from FAO EcoCrop, Sacks 2010, DüV Anlage 4, FAO-56 T22, LfL Bayern, BZL, TLL and an organic-farming source. `validate_profiles` refuses attributes without source, reference and `verify` flag. 32 of 82 attributes are flagged `verify: true` (to be checked against the source).

**Income**: explicitly unavailable. The response includes `"income": {"available": false, "reason": "No real price source ... is connected"}`.

**Persisted state**: Field 2 has inputs (2024 winter wheat, 2025 winter barley, 2026 sugar beet; sandboden; reduce nitrogen; irrigated) and three saved recommendations.

Cold-start performance note: `GET /fields/{id}/analytics/report` (used by the Data tab and by the Advisor's SoilGrids fallback) did not return within 300 s in my probe for Field 2 because no report cache exists for the two current fields (the 12 cached reports belong to deleted fields). The UI loads it in the background, so the Status/Map/Health tabs are not blocked.

### 6.7 Placeholder pages (`App.tsx`)

| Page | What is shown | Backend |
|---|---|---|
| Environmental Profile | "Environmental profile unavailable ... former demonstration indicators and charts are disabled" | none; the data exists now in Field Health but is not linked |
| Farmer Profile | "Farmer profile unavailable"; Save button toasts "Profile persistence is not connected" | `POST /farmer/preferences` echoes the body; `POST /fields/{id}/history` echoes the body. Neither stores anything. |
| Scenario Simulator | "Scenario results unavailable"; Run button toasts that no model is connected | `POST /scenarios/simulate` returns `status: awaiting calibrated scenario service` |
| Reports & Evidence | "Recommendation report unavailable" | `GET /reports/{id}` returns `status: report generation service not connected`. `GET /recommendations/{id}/evidence` is real but unused by the UI. |

The top bar (shown on these pages only) still has a non-functional search box with "⌘ K", an Export button that navigates to Reports, a notifications button that toasts "all caught up" (no notification system), and the avatar "JS".

---

## 7. Complete backend endpoint catalogue

Status: **L** live, **C** cached/local, **D** derived, **S** stub, **X** legacy.

| Method and path | Status | Notes |
|---|---|---|
| GET `/health` | L | |
| GET `/boundaries/status` | C+L | counts from metadata JSON; InVeKoS live check |
| GET `/boundaries/viewport`, `/nearby`, `/search`, `/{id}` | C | DFBK GeoPackage |
| GET `/boundaries/geocode` | L | Nominatim |
| POST/GET/PATCH/PUT/DELETE `/farms`, `/farms/{id}` | C | SQLite |
| POST/GET/PATCH/PUT/DELETE `/fields`, `/fields/{id}`; POST `/fields/import-boundaries`; POST `/fields/{id}/geometry`; GET `/farms/{id}/fields` | C | SQLite |
| POST `/fields/{id}/history` | S | echoes input |
| POST `/farmer/preferences` | S | echoes input |
| GET `/fields/{id}/soil`, `/soil/status`; POST `/soil/extract`, `/soil/refresh`; GET `/soilgrids/variables` | C+L | |
| GET `/nasa/datasets`; GET `/fields/{id}/environmental`, `/status`, `/summary`; POST `/environmental/extract`, `/refresh`; GET `/fields/{id}/environment` | X | legacy NASA pipeline |
| GET `/fields/{id}/analytics/summary`, `/ndvi`, `/weather`, `/gdd`, `/report`; PUT `/planting-date`; POST `/observations/{obs}/toggle`, `/analyze` | L+C | |
| GET `/field-health/map`, `/fields/{id}/card`, `/overlay/{kind}`, `/trend`, `/inputs`, `/data-status`; PUT `/fields/{id}/inputs`; POST `/field-health/poll` | L+C+D | |
| GET `/weather/stations`, `/available-fields`, `/point`, `/fields`, `/fields/{id}`; POST/DELETE `/stations/{id}`; DELETE `/stations` | L | |
| GET `/ai-assistant/fields`, `/fields/{id}/context`, `/conversations`, `/conversations/{id}`; POST `/conversations`, `/chat`; DELETE `/conversations/{id}` | L | |
| POST `/ai-assistant/voice` | S | fixed text |
| GET `/ai-field-detection/model/status`; POST `/scan`, `/jobs/{id}/cancel`; GET `/jobs/{id}`, `/jobs/{id}/predictions` | L | in-memory jobs |
| GET `/nasa-challenge/catalog`, `/catalog/{id}`, `/categories`, `/query`; POST `/query`; GET/POST `/fields/{id}/query`; POST `/fields/{id}/probe-all` | mixed | see 6.3.4 |
| GET `/crops`, `/policy/rules`; POST `/policy/validate` | D | |
| GET/PUT `/fields/{id}/planner-inputs`; GET `/fields/{id}/signals`, `/risk-card`, `/score`, `/vulnerability-timeline` | D | |
| POST `/recommendations/generate`; GET `/recommendations/{id}`, `/recommendations/{id}/evidence` | D | |
| GET `/reports/{id}`, POST `/scenarios/simulate` | S | |

---

## 8. Runtime data state (what is actually present today)

| Item | State |
|---|---|
| Fields | 2 (both DFBK imports near Cottbus; centroids 51.7683/14.2848 and 51.7697/14.2731). Neither has a crop assigned. |
| SoilGrids | Extracted for both. |
| Sentinel-2 NDVI | Field 2: 57 scenes, 2023-01-03 to 2026-11-13. Field 1: 56 scenes. |
| SMAP L4 | Field 1 point: 638 rows, 2016-10-26 to 2026-11-10 (from an earlier AppEEARS task that is no longer listed in `appeears_tasks`). Field 2 point: 340 rows from OPeNDAP (10:30 UTC snapshots; consistent with the ±15-day climatology windows around the current date, which is inferred from the code, not separately verified). |
| SMAP L3 (measured) | Field 1 point only: 42 days, 2026-10-01 to 2026-11-12. None for Field 2. |
| MODIS NDVI | **0 rows.** |
| ECOSTRESS | None. Both area tasks `pending`. |
| AppEEARS tasks | 4: two point (one `processing`, one `pending`), two area (`pending`). Earthdata credentials are configured. |
| IMERG | 400 days (2025-10-10 to 2026-11-13) for the one cell covering both fields. No null days. |
| Legacy env observations | 0 |
| Weather | Live; DWD frost warning active for Kreis Spree-Neiße at probe time. |
| Planner | Inputs and 3 recommendations stored for Field 2. |

Playwright pass: all ten routes loaded with HTTP 200 on every API call and no console errors. Observed API fan-out per page: Dashboard 9 distinct calls, Analytics 9, Weather 4, Crop Planner 3, AI Assistant 3 (plus 21 stored conversations in the history drawer).

---

## 9. Register of fallback, static and misleading items

### 9.1 Fabricated or hard-coded values a user can read

| # | Where | What | Severity |
|---|---|---|---|
| 1 | `StatusTab.tsx` `targetYield` | Fixed t/ha expectations per crop keyword | Medium. Looks like a forecast, has no source. |
| 2 | `Dashboard.tsx` | "DFBK Status 100 % / Sync Durable", "Verified Records" | Low. Decorative status. |
| 3 | `report_service.get_field_status_summary` | `analysis_status = "Verified Satellite Analytics"` regardless of results | Low. |
| 4 | `SidebarUserProfile`, top bar | "Jonas Schmidt, Farm manager, JS" | Low. Fake identity, no auth. |
| 5 | `boundary_provider.get_status` | `wfs_status` literal "offline (HTTP 500 ...)" | Low. Will not change if the WFS recovers. |
| 6 | `weather_station_service.add_virtual_station` | `{"model": "vStation-Pro AgriMesh", "sensors": [...]}` | Medium. Implies hardware. |
| 7 | `ai_assistant /voice` | Returns "Voice audio received successfully." as the transcript | Medium. Fake transcription shown to user. |
| 8 | `nasa/service.py` | `valid_coverage_pct=100.0`, `coverage_percentage=100.0` | Low. |
| 9 | `field_segmentation/service.py` | `geographic_validation` text, `parameters_count` default | Low. |
| 10 | `DataCatalogTab.tsx` | "Upload Data" toast claims a dialog opened | Low. |
| 11 | `weather_station_service._calculate_incoming_clouds` | "Clouds in ~N min" arrival time is a heuristic from hourly cloud cover | Low to medium. |

### 9.2 Mislabelled or stale data

| # | Where | Issue |
|---|---|---|
| 1 | `weather_service.get_precipitation_series` / `get_gdd_series` | Default window fixed to **2024-03-01 to 2024-10-31**. Precipitation cache ignores the requested window. The workspace shows a past season as current. (The Advisor passes the current year and is correct.) |
| 2 | `nasa/storage.py`, `nasa/service.py` | GPM labelled "IMERG Final (`GPM_3IMERGDF.07`)", actual data IMERG Late (`GPM_3IMERGDL.07`). |
| 3 | `/ai-field-detection/model/status` | Validation metrics are from the legacy MobileNetV3 model, shown beside the FTW-PRUE model version. |
| 4 | WeatherView "Radar Rain" | Open-Meteo hourly precipitation, not radar. |
| 5 | WeatherView "Monthly" | 16-day outlook. |
| 6 | WeatherView NDVI layer | Cosmetic repaint, no NDVI data. |
| 7 | `field_analytics/weather_service.py` | `data_source` says "GPM/MERRA-2 PRECTOTCORR"; the product is NASA POWER's corrected precipitation. |
| 8 | `/boundaries/status` and Explorer | InVeKoS shown as "online"; the service never returns parcels. |
| 9 | Advisor context | Says the policy engine is not built; it is. Does not use Field Health data. |
| 10 | `backend/app/data/` | Empty `user_farms_fields.db` next to the real one in `backend/data/`. |

### 9.3 Fallback behaviour that exists on purpose

| Fallback | Behaviour | Fabricates data? |
|---|---|---|
| Planner signals | Live fetch fails -> last stored real value, tagged `cached` with its true date; otherwise `unavailable` | No |
| Weather services | Failure -> 503/omitted/"unavailable" | No |
| `boundariesApi.apiFetch` | Retries once against `http://127.0.0.1:8000` | No (transport only) |
| `reverseGeocodeLocation` | Nominatim fails -> nearest entry in the built-in Brandenburg gazetteer | No, but the label is the nearest known place, not the exact one |
| `executeUnifiedSearch` | Local gazetteer first, backend geocode for postal codes | No |
| Dashboard regional card | GPS denied or unsupported -> Potsdam coordinates, real weather for Potsdam | Real data, possibly wrong place |
| FTW inference | Weights fail to load -> MobileNetV3 U-Net | Lower quality model, still labelled in `architecture` |
| Gemini | Tries several models; total failure -> explicit "unavailable" message | No |
| Sentinel-2 | Failure -> `RasterUnavailable`, observation dropped | No |
| SMAP L3 | Not "recommended" or implausible -> excluded and counted in `rejected_measurements` | No |

### 9.4 Items confirmed absent (previously fabricated)

Pseudo-random POWER precipitation (removed in `weather_service._generate_climatological_precipitation`), synthetic Sentinel-2 chips (`satellite_service`), synthetic NDVI observations (`sentinel_service`), the POWER-based "SMAP" and "GPM" clients, MODIS sine wave, regional soil-profile fallback in SoilGrids statistics, 3D procedural fields and clouds, canned agronomic AI fallback. Tests named `test_field_analytics_synthetic.py` still exist; I did not run the tests.

---

## 10. Risks and recommended follow-ups (ordered)

1. **Credentials on disk.** `.env.example` is byte-for-byte the same size as `.env` (1,474 bytes) and contains what look like real Earthdata username/password/token and a Gemini key. `.gitignore` excludes `*.example`, `.env` and `backend/.env.example`, which limits exposure, but a file named `.example` is normally shared. Rotate those secrets and replace the example values with placeholders.
2. **Analytics workspace fails as a whole if POWER fails** (`Promise.all` in `FieldAnalyticsWorkspace`). Isolate the weather and GDD calls, and move the fixed 2024 window to "current season" or a user-selected range.
3. **Fix the mislabels** in 9.2 items 2 to 5 before a demo (IMERG Late label, model-metrics mismatch, Radar, Monthly).
4. **Remove or label the hard-coded target yield, DFBK 100 % badge, virtual-station "AgriMesh" metadata and the voice stub.** They conflict with the project's own data-integrity decisions (D1, D2).
5. **Connect the two NASA paths.** Dashboard NASA tab and the Advisor use the legacy empty `field_environmental_observations`, while Field Health and Crop Planner read `point_values`/IMERG directly. Either feed the legacy cards from the new store or retire them.
6. **Finish the NASA data fetch.** Run `python scripts/prefetch_field_data.py poll` (or `POST /field-health/poll`) until the four AppEEARS tasks finish; this fills MODIS, SMAP L3 for Field 2, full SMAP L4 history and ECOSTRESS, which unlocks the ECOSTRESS moisture overlay, the planner's `evaporative_stress` and `root_zone_moisture` signals and the vulnerability timeline's drought hazard.
7. **Housekeeping.** Purge orphaned rows (13 deleted fields still hold ~40 MB of NDVI grids and report caches), delete the empty `backend/app/data/user_farms_fields.db`, unify DATA_DIR, remove unused frontend API modules, unused `three` and `@supabase/supabase-js`, `LanguageSelectModal`, `ThreeCloudOverlay`, the legacy extractors, and the `chatsuite/` folder and `chatsuite.zip` (older copy of the AI assistant).
8. **Backend `requirements.txt` is incomplete.** It lists 13 packages (FastAPI, SQLAlchemy, geopandas, rasterio, xgboost, ortools ...) but the code also imports `requests`, `httpx`, `shapely`, `pyogrio`, `pyproj`, `h5py`, `Pillow`, `numpy`, `scipy`, `torch`, `python-dotenv`. A clean install will not start. Conversely `geoalchemy2`, `psycopg`, `xgboost`, `ortools`, `scikit-learn`, `pandas` and `xarray` are not imported anywhere in `backend/app` or `backend/scripts`, and `sqlalchemy` appears in one file only (a PostGIS import script).
9. **Navigation.** Add `/ai-assistant` to the sidebar or remove the page; the top bar search and notification buttons do nothing.
10. **Security posture for any non-local run.** CORS is `*` with credentials, there is no authentication, conversations and fields are global, and `/field-health/data-status` exposes AppEEARS task ids.
11. **Sanity-check** the 0.0 percentile for Field 2's root-zone moisture and the cold-start time of the full analytics report.

---

## 11. File index (where to look)

| Area | Frontend | Backend |
|---|---|---|
| Shell, routing | `src/App.tsx`, `src/components/shell`, `src/components/layout`, `src/i18n` | `backend/app/main.py` |
| Dashboard | `src/components/dashboard/*` | `api/farms.py`, `api/fields.py`, `api/soil.py`, `api/environment.py`, `services/user_farms_repository.py`, `services/soilgrids/*`, `services/nasa/*` |
| Field Explorer | `src/components/fields/FieldExplorerView.tsx`, `src/services/boundariesApi.ts`, `geocodingService.ts` | `api/boundaries.py`, `services/field_boundaries/*`, `api/ai_field_detection.py`, `services/field_segmentation/*` |
| Analytics | `src/components/analytics/*`, `analytics/health/*` | `api/field_analytics.py`, `api/field_health.py`, `services/field_analytics/*`, `services/field_analytics/health/*`, `services/nasa/real/*` |
| Weather | `src/components/weather/*`, `src/services/weatherApi.ts` | `api/weather.py`, `services/weather_station_service.py`, `services/dwd_service.py` |
| AI | `src/components/ai-assistant/*`, `src/components/advisor/AdvisorDrawer.tsx` | `api/ai_assistant.py`, `services/ai_assistant/*` |
| Crop Planner | `src/components/crop-planner/*`, `src/services/cropPlannerApi.ts` | `api/crop_planner.py`, `api/recommendations.py`, `services/crop_planner/*`, `services/policy/*`, `backend/app/data/*.json` |
| NASA catalogue | `analytics/DataCatalogTab.tsx`, `services/nasaChallengeApi.ts` | `api/nasa_challenge.py`, `services/nasa_challenge/*` |
| Decisions and plans | | `docs/decisions.md`, `docs/field-analytics-audit.md`, `plan.md` |
| Launch | | `run.ps1`, `start.ps1`, `.vscode/launch.json` |
| Not part of the runtime | | `scratch/` (probe and patch scripts), `chatsuite/`, `chatsuite.zip`, `test_playwright_hub.py`, `backend/scripts/*` (data prep, training, prefetch) |
