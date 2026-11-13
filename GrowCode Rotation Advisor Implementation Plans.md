# GrowCode Rotation Advisor: Implementation Plans

Four plans for human and AI-agent builders: UI/UX, Backend, Models, Orchestration. Prepared 12 Nov 2026 for NASA Space Apps 2026 (data opens 13 Nov).

## 0. Read this first

**Product.** A decision-support tool that helps farmers compare crop-rotation strategies using NASA Earth observations plus soil, crop and farmer-priority data. Demo regions: Brandenburg (Cottbus) and Punjab. It supports farmer and agronomist judgment and never replaces it.

**Build order.** UI on mock data first, then backend, then models, then integration. Plan 4 (Orchestration) governs sequencing and handoffs.

**Rules every agent follows**

1. The API contract (`contract/openapi.yaml` and the generated `types.ts`) is the single source of truth. Change it only through a contract PR (see Plan 4).
2. No number appears in the UI without provenance: source, native resolution, confidence.
3. Synthetic or mock data is always labelled as such on screen.
4. No claim of field-level truth from coarse sources (SMAP about 9 km, GRACE about 300 km).
5. Plain language first, with jargon explained in a glossary tip.
6. Small pull requests, each with tests and a short note on what changed.

**Assumptions to confirm**

- Working name is GrowCode Rotation Advisor, taken from your app's logo and tagline (Upaj aur Upchar).
- Colours below are estimated from your screenshot. Replace them with exact values from your GrowCode theme file before the polish pass.
- A screenshot can't tell me whether GrowCode is Flutter. This plan builds a React PWA that matches its look. Token names are chosen so they map onto a Flutter ThemeData if you port later.
- Reuse your existing GrowCode illustrations and crop icons wherever you can. They are your own assets and carry the theme better than anything new.

---

# Plan 1: UI/UX

## 1.1 What we are matching (observed in your screenshots)

| Pattern in GrowCode | How it looks | Reuse in Rotation Advisor |
| --- | --- | --- |
| Top app bar | Solid green, white title, back chevron on the left, language switch with globe on the right | Every screen |
| Page background | Near-white with a faint lavender tint | Every screen |
| Section headings | Bold green text (My Crops, Growth Stages for Sugarcane) | Section titles |
| Crop picker | Round grey icon discs, 4 per row, selected one gets a green ring, grouped by category, full-width green Save button | Field setup: current rotation |
| Horizontal scroll cards | Growth-stage cards with illustrations | Rotation timeline (year by year) |
| Weather hero | Rounded blue card, pin with place name, three small day tiles, two advice lines with green and red status dots | Home: field status hero |
| Feature grid (AgroGuide) | 3-column white tiles with an illustrated icon and a short label | Home: RotationGuide grid |
| Accordion rows | White, green outline, green bold label, chevron | Rotation card sections |
| Result screen | Photo header, then plain key-value lines (Crop, Plant Stage, Location) | Rotation detail |
| Sensor tiles | Yellow-green and green tiles; tap opens a centred dialog with current value, status and safe range, then OK | Indicator tiles with plain-language status |
| Bottom navigation | Four icons plus a raised round green plus button in the centre | App navigation |
| Voice | Short plain labels, bilingual toggle | Copy style across the tool |

## 1.2 Design tokens

Values are estimates from the screenshot. Put them in one file (`tokens.ts` plus the Tailwind config) and never hard-code colours elsewhere.

| Token | Approx. value | Use |
| --- | --- | --- |
| `gc-primary` | #3A8F3A | App bar, section headings, selected rings |
| `gc-primary-dark` | #2E7D32 | Pressed state, headings on tinted fills |
| `gc-action` | #4CAF50 | Primary buttons (Save, View Report) |
| `gc-lime` | #DCE84C | Indicator tiles (neutral) |
| `gc-sky` | #3D9BF2 | Hero card (field status) |
| `gc-bg` | #FBF8FD | Page background |
| `gc-surface` | #FFFFFF | Cards and tiles |
| `gc-disc` | #E6E6E6 | Crop icon discs |
| `gc-text` | #1F2A1F | Body text |
| `gc-muted` | #6B7280 | Captions |
| `gc-ok` / `gc-warn` / `gc-risk` | #4CAF50 / #F5B301 / #E53935 | Status dots. Always pair colour with an icon or label |

**Shape and spacing:** card radius 16, tile radius 14, button radius 12, pills fully round. Soft shadow `0 2px 8px rgba(0,0,0,.08)`. 4-point spacing grid, page padding 16, minimum touch target 48 px.

**Type:** a rounded geometric sans (Poppins or similar) for Latin, with Noto Sans Devanagari as the Hindi fallback. App bar title 18/600, section heading 16/700 in green, body 14/400, caption 12/400. Never go below 12 px.

## 1.3 Stack

React 18, Vite, TypeScript; Tailwind driven by the tokens; Radix primitives for accessible dialogs, accordions and sliders; MapLibre GL with a draw control; Apache ECharts; TanStack Query for server state; Zustand for UI state; react-i18next; MSW for mock APIs; vite-plugin-pwa so the app installs on a phone and works offline.

**Layout:** design at 390 px wide first. At 1024 px and above, use two panes (map on the left, content on the right) instead of stretching the phone layout.

## 1.4 Navigation and routes

Bottom bar: **Home, Fields, (+) New analysis, Assistant, Profile.** The raised green plus button starts the Field setup flow.

| Route | Screen |
| --- | --- |
| `/` | Home |
| `/fields` | Saved fields |
| `/new` | Field setup (3 steps) |
| `/field/:id` | Diagnosis |
| `/field/:id/rotations` | Rotation comparison |
| `/field/:id/rotations/:rid` | Rotation detail |
| `/field/:id/scenario` | Scenario lab |
| `/assistant` | Assistant |
| `/methods` | Methods and data |
| `/profile` | Language, units, about |

## 1.5 Screen specifications

**S1. Home**

- Green app bar with the logo, tagline and language switch.
- Hero card in `gc-sky`: pin and place name, three day tiles (today and the next two), and two advice lines with status dots, for example: 'Soil is drying early this week' (risk dot) and 'Good window to sow a cover crop' (ok dot). Content comes from the Indicators endpoint.
- **RotationGuide** grid, 3 columns of white tiles: Field Diagnosis, Compare Rotations, Scenario Lab, Water and Soil, Crop Library, Learn.
- A short 'supports, does not replace, your expertise' notice at the bottom.
- States: no field yet (big 'Add your first field' button), loading (skeleton hero), offline (cached last view with a banner).

**S2. Field setup (3 steps, progress dots in the app bar)**

1. **Where:** map with pin or polygon draw, plus demo fields for Brandenburg and Punjab. Show area in hectares. Reject points outside coverage with a clear message.
2. **What you grow:** crop picker in the GrowCode style (category headings, round discs, green ring on selected). Pick up to 5 past or current years in sequence. Full-width green Save at the bottom.
3. **What matters to you:** six priority sliders (Save water, Earn more, Add nitrogen, Protect soil from erosion, Less work, Local market fit) with one-line helper text, plus two toggles (can irrigate, limited machinery).

**S3. Diagnosis**

- Section heading: 'How your field behaves'.
- 2-column grid of **indicator tiles** (bare months, drought years per 10, frost-free days, heat-stress days, water balance, erosion risk). Each tile has a status colour plus an icon, a one-line meaning and a ProvenanceBadge. Tapping opens the **value dialog**: current value, status, usual range, source and resolution, OK.
- NDVI timeline with bare windows shaded and the crop calendar underneath.
- Monthly water balance bars (rain against evapotranspiration).
- Trend row: small arrows for heat, rain and soil moisture over the years.
- Map card with layer switcher (stress hotspots, erosion zones, management zones) and legend.
- Every chart has a 'What does this mean?' glossary tip and a 'How reliable is this?' expander.

**S4. Rotation comparison**

- Horizontal swipe of rotation cards (stacked on desktop), at least 3: Current rotation, Soil-health rotation, Water-saving rotation, optional Income rotation.
- Card: name, crop sequence as small discs, score with its range, confidence bar, stacked contribution bar, 'Why it was suggested' in one sentence, 'See details' button.
- Priorities drawer re-weights scores live and animates rank changes.
- Table view toggle for dense side-by-side comparison.

**S5. Rotation detail (follows the Prediction Results layout)**

- Header image, key-value lines (Rotation, Crops, Years, Field).
- Green-outlined accordion rows: **Why suggested, Evidence, Benefits, Risks, Data gaps, Verify locally.** Verify locally is expanded by default and cannot be removed.
- Each Evidence item carries a ProvenanceBadge.

**S6. Scenario lab**

- Sliders: rainfall change (-30% to +20%), temperature (+0 to +3 C), drought years per 10.
- Live re-ranking with a 'rank changed' tag, and a small line chart of score against rainfall change per rotation.
- Label clearly: scenario results come from a simple water-balance model, not from the ML forecast.

**S7. Assistant**

- Chat with suggested questions ('Why not rye?', 'What if I cannot irrigate?'). Shows which tools were used. Stubbed with canned answers until the LLM service exists.

**S8. Methods and data**

- Dataset table (source, native resolution, cadence, used for), satellite versus ground measurement explainer, glossary, model cards, limitations.

**S9. Profile**

- Language (EN, DE, HI), units, saved fields, about and data sources.

## 1.6 Shared components (build before screens)

`AppBar`, `BottomNav` with `FabPlus`, `HeroCard`, `FeatureTile`, `StatTile`, `ValueDialog`, `AccordionRow`, `CropDisc` and `CropPicker`, `PrimarySaveButton`, `PrioritySlider`, `RotationCard`, `ContributionBar`, `ConfidenceBar`, `ProvenanceBadge`, `VerifyLocallyPanel`, `DataGapNote`, `SyntheticBanner`, `GlossaryTip`, `EmptyState`, `ErrorState`, `Skeleton`.

`ProvenanceBadge` takes a `Provenance` object and renders source, native resolution and confidence. It is the only way numbers are displayed, so provenance cannot be forgotten.

## 1.7 Charts and map styling

- Chart palette from the tokens. Never encode risk by red against green alone; add icons, patterns or labels.
- Bare windows: soft brown hatched band. Stress: orange. Water surplus: sky.
- Map: light basemap, field outline in `gc-primary`, hotspot layers with a legend and opacity slider. Bundle a small PMTiles file for both regions so the demo works offline.

## 1.8 Content and i18n rules

- All strings are i18n keys from day one. English is complete, German and Hindi are scaffolded and marked 'machine-translated' until reviewed.
- Write at about a grade 6 reading level. Short sentences, no unexplained acronyms.
- Missing data shows 'No data for this period' with a reason, never a blank chart or a zero.

## 1.9 Accessibility, performance, offline

- WCAG AA contrast (check green on white and white on green), keyboard-operable sliders and cards, text summaries for every chart, visible focus rings.
- Lazy-load map and chart code per route. Target under 3 s first paint on a mid-range phone.
- Service worker caches the shell, demo fields and last results.

## 1.10 Task list for UI agents

Tasks run in order unless the Depends column allows parallel work. Every task ends with a passing test and a short PR note.

| ID | Task | Depends on | Acceptance |
| --- | --- | --- | --- |
| UI-0 | Scaffold: Vite, Tailwind from tokens, fonts, AppBar, BottomNav with FAB, router | none | App shell renders at 390 px and 1280 px with correct colours |
| UI-1 | Contract types, MSW handlers, fixture generator for both regions | UI-0 | Every endpoint returns typed mock data; Brandenburg and Punjab fixtures visibly differ |
| UI-2 | Shared components (section 1.6) with a Storybook-style demo page | UI-0 | Each component has loading, empty and error variants |
| UI-3 | Home screen | UI-1, UI-2 | Hero and grid render from mocks; empty state works |
| UI-4 | Field setup (map draw, crop picker, priorities) | UI-1, UI-2 | Field, rotation and priorities persist in the store and survive reload |
| UI-5 | Diagnosis (tiles, dialog, charts, map layers) | UI-2, UI-4 | Every number shows a ProvenanceBadge; bare windows are shaded |
| UI-6 | Rotation comparison and detail | UI-2, UI-4 | At least 3 cards; sliders change rank; Verify locally always present |
| UI-7 | Scenario lab | UI-6 | Debounced re-score; rank-change tag appears |
| UI-8 | Assistant (stub) | UI-2 | Canned replies and tool-call display |
| UI-9 | Methods, Profile, i18n switcher | UI-2 | EN complete; DE and HI keys load |
| UI-10 | PWA, accessibility pass, mobile pass, Playwright smoke tests | UI-3 to UI-9 | Full flow works at 375 px; axe has no serious issues; 3 smoke tests pass |
| UI-11 | Swap MSW for the real API and fix contract mismatches | Backend BE-6 | Contract tests green against the real API |

## 1.11 Definition of done (UI)

- Both regions run end to end: add field, set priorities, read diagnosis, compare 3+ rotations, run a scenario.
- Every number shows provenance. Every rotation shows data gaps and Verify locally.
- Visually matches the GrowCode screenshots: green app bar, round crop discs, green-outlined accordions, hero card, FAB navigation.
- No console errors, all API access goes through one client module, mocks match the contract exactly.

---

# Plan 2: Backend

## 2.1 Responsibilities

1. Serve the API contract that the UI already mocks.
2. Turn raw NASA and auxiliary data into a canonical field context, then into indicators.
3. Run the transparent scoring engine and the scenario (water-balance) engine live.
4. Serve model outputs and map tiles from precomputed stores.
5. Gateway to the LLM explainer, with number-grounding checks.

The backend never calls satellite APIs during a demo. Everything heavy is precomputed and cached.

## 2.2 Components

| Component | Role | Tech |
| --- | --- | --- |
| API service | REST endpoints, validation, auth-free demo mode | FastAPI, Pydantic v2 |
| Adapters | Raw dataset to canonical variables (YAML-configured) | xarray, rioxarray, earthaccess, requests |
| Indicator library | Pure functions: dataset in, number plus interval out | NumPy, pandas, SciPy |
| Scoring engine | Weighted multi-criteria score and contributions | Plain Python |
| Scenario engine | Bucket water balance under what-if weather | Plain Python |
| Store | Fields, indicators, scores, model registry | SQLite first, Postgres/PostGIS if time allows |
| Raster store and tiles | COG/Zarr files served as map tiles | TiTiler |
| LLM gateway | Calls the explainer service, runs checks | httpx, vLLM (separate container) |
| Orchestration | One-command startup | Docker Compose |

## 2.3 Repo layout

```
backend/
  app/
    api/            # routers: regions, fields, indicators, rotations, scenario, chat, methods
    schemas/        # Pydantic models generated from contract/openapi.yaml
    adapters/       # base.py, synthetic.py, power.py, generic_raster.py, <new>.py
    indicators/     # bare_field, water_balance, frost_heat, erosion, drought, trends
    scoring/        # engine.py, rotations.py, confidence.py
    scenario/       # bucket.py, crop_coefficients.py
    llm/            # gateway.py, tools.py, number_check.py
    store/          # db.py, repositories.py
  config/           # regions.yaml, datasets.yaml, crops.csv
  data/             # raw, interim, processed (gitignored, with a README)
  tests/
```

## 2.4 Canonical data contract

Every dataset is converted into one internal format. Everything downstream reads only this.

- **Dimensions:** time, with variables below. NaN where missing. Units in `attrs`.
- **Variables:** `precip_mm`, `tmax_c`, `tmin_c`, `et_mm`, `ndvi`, `soil_moisture_surf`, `soil_moisture_root`, `lst_c`, `tws_anom_cm`.
- **Static layer:** slope, aspect, TWI, sand, silt, clay, organic carbon, pH, water-holding capacity.
- **Provenance per variable:** source, native resolution (m), cadence, quality flag, coverage percent. This feeds the UI badges directly.

## 2.5 Endpoints

| Method and path | Purpose | Notes |
| --- | --- | --- |
| GET `/api/regions` | Regions and coverage | Static config |
| GET `/api/fields?region=` | Demo and saved fields |  |
| POST `/api/fields` | Create field from polygon | Validates coverage and area |
| GET `/api/fields/{id}/indicators` | All indicators plus series | Precomputed, cached |
| POST `/api/fields/{id}/rotations/score` | Score 3+ rotations | Body: priorities, optional scenario, current rotation |
| POST `/api/fields/{id}/scenario` | Re-run water balance and re-score | Live, under 500 ms target |
| GET `/api/crops` | Crop traits table |  |
| POST `/api/chat` | Assistant | Tool-calling, grounded answers |
| GET `/api/methods/datasets` | Dataset and model cards |  |
| GET `/tiles/{layer}/{z}/{x}/{y}` | Raster tiles | TiTiler |

Errors use one shape: `{code, message, hint}`. Never return a 200 with an empty chart; return the reason for missing data.

## 2.6 Indicator library

Pure, unit-tested functions. Each returns `{value, interval, unit, provenance}`.

| Indicator | Method |
| --- | --- |
| Bare-field windows | NDVI below threshold (about 0.2) for N consecutive days, later replaced or backed by model A |
| Water balance (monthly) | Precipitation minus evapotranspiration |
| Frost-free days | Season length between last spring and first autumn minimum below 0 C |
| Heat-stress days | Days with tmax above the crop-relevant threshold |
| Drought frequency | Share of years with root-zone moisture below the 20th percentile |
| Erosion risk | Slope times extreme-rain frequency times bare-day share (relative index, not tonnes per hectare) |
| Trends | Theil-Sen slope with Mann-Kendall p-value |

## 2.7 Scoring engine

```
score(rotation) = sum over indicators of weight(priorities) x normalised_indicator(rotation, field)
```

- Indicators: water balance, bare-days, erosion risk, nitrogen contribution, root-depth benefit, disease-break interval, predicted stress, workload and market fit.
- Normalise each indicator to 0 to 1 within the candidate set, so scores compare options and are not absolute.
- Store per-indicator contributions so the UI can show why a rotation ranked where it did.
- **Uncertainty range:** propagate indicator intervals by Monte Carlo sampling (a few hundred draws), report the 10th to 90th percentile.
- **Confidence flag:** combine data coverage, native resolution against field size, interval width and model-versus-baseline agreement. Output high, medium or low.
- **Candidates:** current rotation, soil-health (cover crop plus legume), water-saving (drought-tolerant or deep-rooted), optional income. Generated from templates in `crops.csv`, vetoed by agronomic rules (same-family return interval, legume placement) and ranked by the sequence model when it exists.

## 2.8 Scenario engine

Machine-learning models extrapolate badly to climates they have not seen, so what-if sliders use a physical model.

- **Bucket water balance:** soil storage with capacity from soil data and rooting depth, daily rain in, crop evapotranspiration out (reference ET times FAO-56 crop coefficient by growth stage), runoff and drainage when full.
- **Inputs:** historical daily weather perturbed by the sliders (rainfall percent, temperature offset), optionally real projections from NEX-GDDP-CMIP6 for the region.
- **Outputs:** relative water stress per crop and rotation, feeding the predicted-stress and water indicators.
- State in the UI that scenarios come from this simple model.

## 2.9 Ingestion and adapters

- **Adapter interface:** `load(region, bbox, dates) -> xarray.Dataset` in canonical variables.
- **Config-driven raster adapter:** a `datasets.yaml` block maps file path, variable name, rename, scale, units, nodata, native resolution, cadence and resample rule. A new gridded dataset on 13 Nov should need a YAML edit, not code.
- **Order of adapters:** synthetic (now), NASA POWER (REST, now), generic raster, then whatever NASA delivers.
- **Harmonisation:** aggregate to field means with source resolution recorded, never pretend a coarse pixel describes one field.
- **Check script (`make check`):** no NaN-only variables, plausible units and ranges (NDVI in -1 to 1), monotonic time axis, provenance filled. Run it after every new adapter.

## 2.10 Precompute and caching

- A nightly-style job writes indicators and model outputs per demo field to Parquet or SQLite, rasters to COG.
- The API only reads these, plus the live scoring and scenario functions.
- Cache scoring responses keyed by field, priorities and scenario.

## 2.11 LLM gateway

- Tools exposed to the model: `get_indicators`, `score_rotation`, `get_crop_traits`, `run_scenario`, `explain_score`.
- **Number-grounding check:** every number in the answer must appear in a tool result. If it fails, retry once, then fall back to a template answer.
- Every claim about agronomy must trace to a `crops.csv` row; otherwise the answer says it is not sure and suggests a local expert.

## 2.12 Quality

- Unit tests for every indicator and the scoring engine, using the synthetic adapter.
- Contract tests: validate API responses against the same schema the UI mocks use.
- Structured logs with a request id. No secrets in the repo; `.env.example` only.
- Auth is off for the demo. Add a single read-only API key if you deploy publicly.

## 2.13 Task list for backend agents

| ID | Task | Depends on | Acceptance |
| --- | --- | --- | --- |
| BE-0 | Scaffold FastAPI, config loading, Docker Compose, health check | none | `docker compose up` serves `/health` |
| BE-1 | Canonical schema, synthetic adapter for both regions | BE-0 | Two demo fields return plausible, labelled-synthetic series |
| BE-2 | NASA POWER adapter | BE-1 | Real daily weather for Cottbus and a Punjab point |
| BE-3 | Indicator library with unit tests | BE-1 | All seven indicators pass tests on synthetic data |
| BE-4 | Crop table (8 to 12 crops per region, with sources) and rotation templates | none | `crops.csv` validated by a schema test |
| BE-5 | Scoring engine with contributions, ranges, confidence | BE-3, BE-4 | Changing priorities changes ranks; contributions sum to total |
| BE-6 | API endpoints matching the contract | BE-5 | Contract tests green; the UI can switch from mocks |
| BE-7 | Scenario engine | BE-3, BE-4 | Rain -20% visibly raises water stress for water-hungry crops |
| BE-8 | Generic raster adapter plus `make check` | BE-1 | A new dataset is added via YAML only |
| BE-9 | Real-data adapters for NASA data delivered on 13 Nov | BE-8 | Indicators for both regions come from real data |
| BE-10 | Tile server, LLM gateway, number check | BE-6 | Map layers load; chat answers pass grounding check |

## 2.14 Definition of done (Backend)

All contract endpoints return real or clearly-labelled synthetic data with provenance. Scoring is explainable per indicator. Scenario sliders respond in under half a second. `docker compose up` brings the whole stack up from a clean checkout.

---

# Plan 3: Building and training models

## 3.1 Principles

1. **Baseline first, deep model second.** A deep model must beat a simple baseline on the same split, or the baseline ships and the comparison is reported.
2. **Models produce indicators, not decisions.** Their output goes through the indicator contract. The final rotation score stays a transparent weighted function, because there are no best-rotation labels.
3. **Honest evaluation.** Spatial-block and temporal splits only. No random pixel splits.
4. **Uncertainty on every output**, mapped to a confidence flag.
5. **Everything is precomputed** for the demo.
6. **Proxies are labelled as proxies.** NDVI anomaly is a vigour and yield-stability proxy, not yield.

## 3.2 Data inventory (verify each on the portal; NASA-provided data takes priority)

| Need | Source | Models |
| --- | --- | --- |
| Vegetation time series | HLS, Landsat, MODIS or VIIRS NDVI/EVI | A, C, H, D |
| Soil moisture | SMAP L3 and L4 | B, C, H |
| Land surface temperature | ECOSTRESS (check coverage), MODIS/VIIRS LST | B |
| Rainfall | GPM IMERG, plus CHIRPS for Punjab if needed | B, C, erosion |
| Weather | NASA POWER, ERA5-Land as gap-filler | C, scenario |
| Elevation | NASADEM or SRTM | terrain, B, erosion |
| Soil properties | SoilGrids, BGR maps for Germany | B, scenario |
| Climate projections | NEX-GDDP-CMIP6 | scenario |
| Water storage | GRACE-FO mascons | Punjab context |
| Crop labels | German crop-type maps and sequences, EuroCrops, Brandenburg parcels; Punjab: rule-based or published rice maps | A, D, E, H |
| Validation | DWD station and drought-monitor data, ISMN, India yield and groundwater statistics, crop calendars | all |
| Crop traits | FAO EcoCrop, FAO-56, extension guides | scoring, scenario, LLM |

## 3.3 Models, tiers and gates

| ID | Model | Baseline | Main model | Tier | Gate to start |
| --- | --- | --- | --- | --- | --- |
| A | Phenology and bare-field | NDVI threshold rule | TempCNN or small temporal transformer | 1 | Multi-year NDVI available |
| B | Soil-moisture downscaler (SMAP to 100-500 m) | Bilinear interpolation | LightGBM, then optional small U-Net | 1 | SMAP plus a fine-scale predictor (LST or NDVI) |
| C | Stress forecaster (1 to 8 weeks) | Climatology and persistence | LightGBM quantiles, then TFT or LSTM | 1 | Several years of daily data |
| F | Uncertainty wrapper | none | Conformal prediction, 5-seed ensembles | 1 | After B and C exist |
| H | Crop drought sensitivity | Constant sensitivity | Mixed-effects model or boosted trees plus SHAP | 1-2 | Crop class per field-year, including dry years |
| D | Prithvi-EO-2.0 fine-tune (crop segmentation, zoning embeddings) | A | TerraTorch fine-tune | 2 | HLS covers regions and labels exist |
| E | Rotation sequence model | Markov chain | Small GPT-style transformer over crop tokens | 2 | Multi-year crop sequences |
| G | Explainer LLM | Prompted open model | LoRA on a 7 to 14B open model, served with vLLM | 3 | Engine outputs stable |

**What is not a trained model:** the final rotation score and the what-if scenarios (physics-based, see Plan 2).

## 3.4 Repo layout

```
ml/
  configs/{data,model}/      # Hydra or OmegaConf YAML, one per model and region
  features/                  # build.py, terrain.py, temporal.py, splits.py
  models/<a..h>/             # model.py, train.py, predict.py
  uncertainty/               # conformal.py, ensemble.py, calibration.py
  eval/                      # metrics.py, baselines.py, report.py
  registry/                  # model cards, artifact paths, data hashes
  export/to_indicators.py    # model outputs to the API contract
  tests/
```

Conventions: config-driven variable names, Weights & Biases or MLflow tracking (git hash, config, data hash), fixed seeds and 3 seeds for any reported number, one model card per model.

## 3.5 Splits and leakage rules

| Rule | Reason |
| --- | --- |
| Spatial block cross-validation (10 to 20 km blocks held out whole) | Neighbouring pixels are nearly identical |
| Temporal holdout, with at least one drought year in test | Tests behaviour under stress |
| No future leakage: features at time t use data up to t | Honest forecasting |
| Region holdout (train Brandenburg, test Punjab) as a stress test | Shows where models do not transfer |

`splits.py` and its leakage tests come first and need no real data.

## 3.6 Model specifications

**A. Phenology and bare-field.** Gap-fill NDVI (cloud mask, Savitzky-Golay or Whittaker smoothing, regular 5 to 10 day grid). Augment with random temporal masking. Class-weighted cross-entropy. Outputs: bare windows with probability, crop-class probabilities, green-up and senescence dates. Metrics: F1 per class on held-out blocks, bare-day error against a crop calendar. The rule-based detector may already be good enough, so ML earns its place through crop classification and gap robustness.

**B. Soil-moisture downscaler.** Train at SMAP scale (aggregate features to SMAP pixels), apply at fine scale. State the scale-invariance assumption. After prediction, rescale so fine pixels average back to the SMAP value. Metrics: spatial-block R2 and RMSE against SMAP, improvement over bilinear, and comparison with in-situ stations where they exist. Fine-scale skill cannot be directly verified without in-situ data; say so.

**C. Stress forecaster.** Direct multi-horizon prediction with quantile loss (10, 50, 90). Lagged moisture, NDVI, rain, temperature, ET, day-of-year harmonics and static soil and terrain as inputs. SHAP (boosted trees) or variable-selection weights (TFT) supply the top drivers for the UI. Metrics: skill against climatology per lead time, pinball loss, interval coverage, and a separate drought-year score. Use C for current-conditions risk only, not for scenarios.

**H. Crop drought sensitivity.** For each field-year compute a seasonal NDVI integral or peak, then relate its anomaly to drought and heat indices per crop class. Output a sensitivity value with a confidence interval per crop and region, feeding the predicted-stress indicator. Sanity check: known drought-tolerant crops should rank as less sensitive; if not, investigate before trusting it.

**D. Prithvi-EO-2.0.** TerraTorch, HLS chips (for example 224 by 224, 3 to 4 timesteps), frozen encoder first, then unfreeze, bf16 on the H100. Uses: crop segmentation compared against A, and per-pixel embeddings plus slope and TWI clustered into management zones. If the gate fails, build zones from terrain and NDVI statistics only.

**E. Sequence model.** Markov chain first, then a small transformer. It filters candidate rotations to ones real farmers use and flags unusual ones. It is a plausibility prior, not a goodness measure. Deterministic agronomic rules can veto; the model only ranks.

**F. Uncertainty.** Split conformal prediction or conformalised quantile regression (MAPIE) for B and C; ensembles plus temperature scaling for classifiers. Report empirical coverage on spatially held-out blocks and note that spatial correlation makes it optimistic. Confidence mapping: data coverage, resolution against field size, interval width, agreement with the baseline.

**G. Explainer LLM.** Turns engine JSON into evidence cards in English, German and Hindi. It never computes numbers. Build training pairs by sampling fields and priorities, running the real engine, writing target cards from templates, and keeping only cards that pass the schema check, number-grounding check, crop-table traceability check and the Verify-locally check. German is reviewed by you; mark Hindi and Punjabi machine-translated unless a native speaker reviews them.

## 3.7 Export contract

Every model writes only this shape, and nothing else reaches the API:

```json
{
  "indicator": "bare_days",
  "field_id": "bb_001",
  "value": 142,
  "interval": [128, 158],
  "unit": "days/yr",
  "provenance": {"source": "HLS+model_A2", "native_resolution_m": 30,
                 "confidence": "medium", "model_version": "a2_2026-11-14"}
}
```

## 3.8 Evaluation matrix

| Model | Primary metric | Must beat |
| --- | --- | --- |
| A | F1 and bare-day error | Rule-based and random forest |
| B | RMSE and R2 (spatial CV) | Bilinear interpolation |
| C | Skill versus climatology, pinball loss | Persistence and climatology |
| H | Held-out-year error, ranking sanity | Constant sensitivity |
| D | mIoU | A |
| E | Perplexity | Markov chain |
| F | Interval coverage | Nominal level |
| G | Number-grounding rate of at least 99% | Unconstrained prompted model |
| System | Regional sanity: Punjab and Brandenburg outputs differ as agronomy predicts | n/a |

## 3.9 Day-0 decision table (13 Nov, first 2 to 3 hours)

Audit each delivered dataset: spatial and temporal coverage, resolution, cadence, missing rate, and whether Brandenburg and Punjab are covered. Then:

| If the data includes | Do this |
| --- | --- |
| Multi-year NDVI/HLS plus any crop labels | A, then H, then D if time allows |
| SMAP plus a fine-scale predictor | B |
| Long daily weather and soil-moisture series | C |
| Only coarse data and no labels | Rule-based indicators, scenario engine, C0 and C1 only, honest Methods page |
| One region only | Make it the main demo, put the other in extended scope |

Minimum viable ML, in order: A0 and A1, B0 and B1, C0 and C1, F, then H, then G. D and E come last. Cut order if time runs short: D, E, LoRA fine-tune, multilingual output, B U-Net, C deep model.

## 3.10 Compute (rough estimates on one H100)

A, E and H train in minutes to an hour; B and C in minutes (boosted trees) to a few hours (deep); D about 2 to 8 hours, mostly data loading; G about 2 to 5 hours. Data preparation will be the bottleneck, so cache in Zarr chunks aligned to the demo fields.

## 3.11 Task list for ML agents

| ID | Task | Depends on | Acceptance |
| --- | --- | --- | --- |
| ML-0 | Scaffold, configs, tracking, seeds | none | A dummy run logs config and git hash |
| ML-1 | `splits.py` with leakage tests, `metrics.py` | ML-0 | Tests prove no spatial or temporal leakage |
| ML-2 | Terrain features (slope, TWI, flow accumulation) from NASADEM | ML-0 | Matches a reference tile on a known area |
| ML-3 | Baselines A0, B0, C0 on synthetic data | ML-1 | Evaluation harness runs end to end |
| ML-4 | Day-0 data audit report | Data delivery | Table of coverage, gaps, decisions |
| ML-5 | Model A (A1 then A2) | ML-4 | Beats rule baseline on held-out blocks, or baseline ships |
| ML-6 | Model B (B1) | ML-2, ML-4 | Beats bilinear in spatial CV; mass conservation holds |
| ML-7 | Model C (C1) | ML-4 | Positive skill over climatology at some lead times |
| ML-8 | Uncertainty wrapper F | ML-6 or ML-7 | Coverage reported on held-out blocks |
| ML-9 | Model H | ML-5 | Sanity ranking passes |
| ML-10 | Export to the indicator contract, model cards | ML-5 to ML-9 | Backend contract tests pass |
| ML-11 | Explainer LLM data, LoRA, grounding evaluation | BE-6 | Grounding rate at least 99% on held-out prompts |
| ML-12 | Stretch: D (Prithvi), E (sequence model), deep C and B | ML-10 | Beats its baseline or is dropped |

## 3.12 Definition of done (Models)

At least one trained model beats its baseline under spatial-block evaluation, with uncertainty and a model card. Every model output is exported through the indicator contract with provenance. Limitations are written plainly on the Methods page.

---

# Plan 4: Orchestration and coordination

## 4.1 Operating model

You are the **Lead**: you set priorities, approve contract changes, and make every go or no-go call. Agents work in parallel lanes against a shared contract, in small tasks with clear acceptance checks. Nobody waits for real NASA data to start; everyone builds against the synthetic and mock layers until the swap on 13 Nov.

## 4.2 Agent roles

| Role | Owns | Reads | Must not touch |
| --- | --- | --- | --- |
| **Lead (you)** | `contract/`, `DECISIONS.md`, merges, priorities | everything | n/a |
| **UI agent** | `web/` | `contract/`, Plan 1 | `backend/`, `ml/` |
| **Backend agent** | `backend/` | `contract/`, Plan 2 | `web/`, model internals |
| **Data agent** | `backend/app/adapters/`, `backend/config/datasets.yaml`, `data/` | dataset docs | indicator and scoring logic |
| **ML agent** | `ml/` | `contract/`, Plan 3 | `web/`, API routers |
| **LLM agent** | `ml/models/g_explainer/`, `backend/app/llm/` | engine outputs, crop table | numeric computation |
| **QA agent** | `tests/`, `e2e/`, CI config | everything, read-only | product code (files issues instead) |
| **Docs and demo agent** | `README.md`, Methods content, demo script | everything, read-only | product code |

One agent can play several roles if you are short on agents, but keep the file ownership boundaries.

## 4.3 Monorepo layout

```
rotation-advisor/
  contract/        # openapi.yaml, schemas, generated types.ts and Pydantic models
  web/             # Plan 1
  backend/         # Plan 2
  ml/              # Plan 3
  e2e/             # Playwright flows against docker compose
  docs/            # STATUS.md, DECISIONS.md, methods, model cards, data licences
  docker-compose.yml, Makefile, .env.example, CODEOWNERS
```

`CODEOWNERS` enforces the ownership table above, so an agent cannot silently edit another lane.

## 4.4 Contract-first workflow

1. `contract/openapi.yaml` defines every endpoint and payload (fields, indicators, series, provenance, rotation score, scenario, chat).
2. `make gen` produces `web/src/api/types.ts` (via openapi-typescript) and `backend/app/schemas/` (Pydantic).
3. **Changing the contract:** open a PR touching only `contract/` plus the regenerated files, with a one-paragraph reason and a list of affected lanes. The Lead approves. Dependent lanes rebase within the same block.
4. **Contract tests:** the backend's responses are validated against the schema in CI, and the UI's mocks are validated against the same schema. A mismatch fails the build.
5. Additive changes only after Gate G1. Breaking changes need a Lead decision logged in `DECISIONS.md`.

## 4.5 Task protocol

**Task card (every task, in `docs/TASKS.md` or your tracker)**

```
ID:           UI-5
Title:        Diagnosis screen
Owner:        UI agent
Depends on:   UI-2, UI-4, contract v1
Inputs:       Plan 1 section S3, mock fixtures
Deliverable:  PR with screen, tests, screenshots at 390 and 1280 px
Acceptance:   (copied from the plan's task table)
Out of scope: real data, new endpoints
```

**Statuses:** Ready, In progress, In review, Blocked (say by what), Done. Update `docs/STATUS.md` at the end of every block with one line per task.

**Definition of ready:** contract exists, dependencies are Done, acceptance is testable.

**Definition of done:** acceptance met, tests pass, no new console errors, provenance shown for any number, PR note says what changed and what is still a mock.

**Handoff message (agent to agent, via the Lead):** what I built, where it lives, how to run it, what I assumed, what I need next. Nothing is handed off verbally.

## 4.6 Branching and CI

- Trunk-based: short-lived branches named `<lane>/<task-id>`, squash merge to `main`.
- CI on every PR: lint (ruff, eslint), type-check, unit tests, contract tests, build. The QA agent adds Playwright smoke tests once UI-6 and BE-6 exist.
- `main` must always run with `docker compose up`.
- No force-pushes to `main`. No secrets in the repo. Large data stays out of git (use `data/` plus a download script).

## 4.7 Timeline and parallel lanes

Today is Thursday 12 Nov and the data opens on Friday 13 Nov, so the pre-data window is short. Adjust block lengths to your event's real schedule.

| Block | Lead | UI | Backend and Data | ML | Docs and QA |
| --- | --- | --- | --- | --- | --- |
| **B1: today (pre-data)** | Freeze contract v1 | UI-0 to UI-3 | BE-0, BE-1, BE-2 | ML-0, ML-1, ML-2 (splits, metrics, terrain) | Repo, CI, README skeleton |
| **B2: today evening** | Review G1 | UI-4, UI-5 start | BE-3, BE-4, BE-5 | ML-3 (baselines on synthetic data) | Contract tests |
| **B3: 13 Nov, hours 0 to 3** | Day-0 decisions | UI-5, UI-6 | BE-8, start BE-9 (adapters for delivered data) | ML-4 data audit report | Data licence and attribution log |
| **B4: 13 Nov, rest** | Gate G3 | UI-6, UI-7 | BE-6, BE-7, BE-9 | ML-5, ML-6, ML-7 (pick by data) | Playwright flows |
| **B5: next block** | Gate G4 | UI-8 to UI-11 (swap to real API) | BE-10 | ML-8, ML-9, ML-10, then ML-11 | Methods page, model cards |
| **B6: final block** | Freeze and ship | Polish, mobile pass | Bug fixes only | Stretch only if everything above is green | Demo video, submission checklist |

## 4.8 Integration gates

| Gate | When | Pass criteria |
| --- | --- | --- |
| **G1: contract frozen** | End of B1 | OpenAPI validates; types generated for both sides; mocks and a stub API both pass contract tests |
| **G2: skeleton end to end** | End of B2 | `docker compose up` serves the UI against the backend running on synthetic data; flow works for both regions, labelled synthetic |
| **G3: first real data** | B3 to B4 | At least one real variable per region flows through an adapter, indicator and API into the UI with correct provenance; `make check` is green |
| **G4: first trained model** | B5 | One model beats its baseline under spatial-block evaluation, exports through the indicator contract, and appears in the UI with an interval and confidence |
| **G5: ship** | B6 | Definition of done in Plans 1 to 3 met; demo runs from a clean checkout; README, Methods and attribution complete |

If a gate fails, the Lead decides: fix, reduce scope (cut list), or ship the fallback.

## 4.9 Mock-to-real switch (the 13 Nov procedure)

1. Data agent adds the delivered dataset to `datasets.yaml` and runs `make check`.
2. Backend agent replaces synthetic series for one demo field per region and regenerates indicators.
3. UI agent turns MSW off with an environment flag and fixes contract mismatches the tests reveal.
4. QA agent reruns the end-to-end flows and records differences from the mock behaviour.
5. Only then do the remaining fields and the ML lane switch to real data.

Synthetic data stays available as a fallback behind a flag, still labelled on screen.

## 4.10 Dependency map (what blocks what)

| Blocked item | Waits for |
| --- | --- |
| UI screens beyond mocks | Contract v1 (G1) |
| Backend real indicators | Data agent adapters (BE-8, BE-9) |
| Any trained model | Day-0 audit (ML-4) and splits (ML-1) |
| Scenario sliders | Crop table (BE-4) and scenario engine (BE-7) |
| Evidence cards from the LLM | Stable engine outputs (BE-6) |
| Uncertainty display | Model F or the Monte Carlo ranges (BE-5) |
| Demo video | G4 |

The critical path is contract, then adapters, then indicators, then scoring, then API, then UI on real data. Models are an enhancement on that path, not a prerequisite, which is why the rule-based indicators must ship first.

## 4.11 Risks and the cut list

| Risk | Mitigation | Owner |
| --- | --- | --- |
| NASA data is late, huge or does not cover a region | Synthetic fallback, POWER and other open data, one-region demo | Data agent, Lead |
| Labels missing (especially Punjab crop types) | Rule-based phenology, weak supervision, say so in Methods | ML agent |
| Contract drift between lanes | CI contract tests, one owner for `contract/` | Lead, QA |
| Deep model does not beat baseline | Ship the baseline and report the comparison | ML agent |
| Agents edit each other's files | `CODEOWNERS`, ownership table | Lead |
| Overclaiming accuracy or field-level truth | Provenance on every number, limitations text, Verify locally | All |
| Time overrun | Cut in this order: Prithvi (D), sequence model (E), LoRA fine-tune, German and Hindi polish, deep models, PDF export, Assistant, management-zone layer | Lead |

## 4.12 Rules for all agents

- Never invent data, citations or agronomy. If a fact is not in the crop table or a cited source, mark it as a data gap.
- Label synthetic and machine-translated content on screen.
- Record the licence and attribution of every dataset in `docs/DATA_LICENCES.md` as you add it.
- Keep outputs deterministic where possible (fixed seeds, pinned dependencies).
- Prefer small, reviewable changes. Say what you did not finish.
- Do not exceed your lane. File an issue to the owner instead.
- Escalate to the Lead when blocked for more than one block, when a contract change is needed, or when a result looks too good.

## 4.13 Agent briefing template

Give each agent this block with its plan section attached:

```
You are the <ROLE> agent on GrowCode Rotation Advisor (NASA Space Apps 2026).
Read: Section 0 and your plan in the Implementation Plans doc, and contract/openapi.yaml.
You own: <paths>. You must not edit: <paths>.
Your tasks: <task IDs with acceptance criteria>.
Work in small PRs on branches named <lane>/<task-id>. Run the checks before each PR.
Never show a number without provenance. Label synthetic data. Do not invent facts.
At the end of each block, write one line per task in docs/STATUS.md:
  done / in progress / blocked (by what) / what I need next.
If the contract must change, stop and request it from the Lead.
```

## 4.14 Submission checklist (owner: Docs and demo agent, approver: Lead)

1. Read the event rules and confirm what is allowed for pre-existing code, outside datasets and third-party tools. Mention the pre-built skeleton and open-source libraries openly in the submission.
2. Confirm the project clearly uses NASA-provided data, and list each dataset with its citation.
3. README with a one-command run, screenshots and architecture overview.
4. Methods page complete: dataset table, satellite versus ground-truth explainer, model cards, validation numbers, limitations.
5. Attribution and licence log complete.
6. Demo video following the flow: add a field, read the diagnosis, compare three rotations, change priorities, run a scenario, show the Verify locally panel.
7. Clean-checkout test: clone, `docker compose up`, run the flow, no manual steps.

---

# Appendix A: Frontend build guide (extends Plan 1)

Plan 1 says what the UI looks like and which tasks exist. This appendix says how to build it: commands, files, code scaffolds, build slices, tests and ready-to-use agent prompts. The UI agent reads Section 0, Plan 1 and this appendix.

## A.1 Bootstrap

```
npm create vite@latest web -- --template react-ts
cd web
npm i react-router-dom @tanstack/react-query zustand react-i18next i18next
npm i react-hook-form zod @hookform/resolvers
npm i echarts echarts-for-react maplibre-gl react-map-gl @mapbox/mapbox-gl-draw @turf/turf pmtiles
npm i @radix-ui/react-dialog @radix-ui/react-accordion @radix-ui/react-slider @radix-ui/react-tooltip @radix-ui/react-tabs
npm i -D tailwindcss postcss autoprefixer msw vitest @testing-library/react @testing-library/jest-dom
npm i -D @playwright/test @axe-core/playwright openapi-typescript vite-plugin-pwa
```

Pin whatever versions the install resolves and commit the lockfile. Add scripts: `dev`, `build`, `test`, `e2e`, `gen` (runs openapi-typescript against `../contract/openapi.yaml`), and `lint`.

Environment flags in `.env`: `VITE_API_BASE=/api`, `VITE_USE_MOCKS=true`, `VITE_TILE_BASE=`.

## A.2 File-level structure

```
web/src/
  main.tsx, App.tsx, router.tsx
  styles/index.css                 # Tailwind layers, font-face, safe-area helpers
  design/tokens.ts                 # single source of colours, radii, shadows, type scale
  api/
    types.ts                       # generated from the contract (do not edit by hand)
    client.ts                     # fetch wrapper, error shape {code,message,hint}
    queries.ts                    # query keys and hooks
    mocks/{browser.ts,handlers.ts,fixtures.ts,seed.ts}
  store/{field.ts,priorities.ts,scenario.ts,ui.ts}
  i18n/{index.ts,en.json,de.json,hi.json,glossary.en.json}
  components/
    layout/{AppBar,BottomNav,FabPlus,PageContainer,TwoPane}.tsx
    common/{HeroCard,FeatureTile,StatTile,ValueDialog,AccordionRow,PrimarySaveButton,
            ProvenanceBadge,ConfidenceBar,SyntheticBanner,GlossaryTip,VerifyLocallyPanel,
            DataGapNote,EmptyState,ErrorState,Skeleton}.tsx
    crops/{CropDisc,CropPicker,CropSequence}.tsx
    inputs/{PrioritySlider,PriorityPanel,ScenarioSliders,ToggleRow}.tsx
    rotation/{RotationCard,ContributionBar,RotationTable,RankChangeTag}.tsx
    charts/{ChartFrame,NdviTimeline,WaterBalance,TrendRow,ScenarioLines}.tsx
    map/{FieldMap,DrawControl,LayerSwitcher,Legend,coverage.ts}.tsx
  pages/{Home,Fields,FieldSetup,Diagnosis,Rotations,RotationDetail,Scenario,Assistant,Methods,Profile}.tsx
  lib/{format.ts,units.ts,status.ts,a11y.ts}
  assets/                          # GrowCode illustrations and crop icons (reuse your own)
web/e2e/                           # Playwright flows
```

## A.3 Tokens and Tailwind wiring

```ts
// design/tokens.ts (values are estimates from the screenshot; replace with real ones)
export const tokens = {
  color: {
    primary: '#3A8F3A', primaryDark: '#2E7D32', action: '#4CAF50',
    lime: '#DCE84C', sky: '#3D9BF2', bg: '#FBF8FD', surface: '#FFFFFF',
    disc: '#E6E6E6', text: '#1F2A1F', muted: '#6B7280',
    ok: '#4CAF50', warn: '#F5B301', risk: '#E53935',
  },
  radius: { card: 16, tile: 14, button: 12 },
  shadow: { card: '0 2px 8px rgba(0,0,0,.08)' },
  font: { latin: 'Poppins, system-ui, sans-serif', deva: 'Noto Sans Devanagari, sans-serif' },
} as const;

// tailwind.config.ts
import { tokens } from './src/design/tokens';
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {
    colors: Object.fromEntries(Object.entries(tokens.color).map(([k, v]) => ['gc-' + k, v])),
    borderRadius: { card: '16px', tile: '14px', btn: '12px' },
    boxShadow: { card: tokens.shadow.card },
    fontFamily: { sans: [tokens.font.latin, tokens.font.deva] },
  } },
};
```

Rule: components use only `gc-*` classes and token-derived values. A lint check (grep for `#` hex values outside `design/`) runs in CI.

## A.4 App shell

- `router.tsx`: lazy-load every page (`React.lazy`) so the map and chart bundles load only where needed.
- `AppBar`: green bar, back chevron (hidden on root tabs), title, right slot for the language switch with a globe icon.
- `BottomNav`: Home, Fields, centre `FabPlus`, Assistant, Profile. The FAB is raised about 20 px above the bar, 56 px wide, `gc-action` fill, opens `/new`.
- `PageContainer`: page padding 16, `gc-bg` background, bottom padding that clears the nav and the device safe area (`env(safe-area-inset-bottom)`).
- `TwoPane` (at 1024 px and up): map pane left, content pane right. Below that, single column.
- A global `SyntheticBanner` reads the provenance of the visible data and shows when any source is synthetic.

## A.5 API layer and mocks

- `client.ts` exposes `get`, `post`, and throws a typed `ApiError`. Nothing else in the app calls `fetch`.
- `queries.ts` defines keys such as `['indicators', fieldId]` and hooks `useRegions`, `useFields`, `useIndicators`, `useScoreRotations(fieldId, priorities, scenario)`, `useCrops`, `useDatasets`, `useChat`.
- `useScoreRotations` debounces input by 300 ms and keeps the previous result visible while fetching (`placeholderData`), so ranks animate instead of flashing.
- MSW starts in `main.tsx` only when `VITE_USE_MOCKS=true`. Handlers use the same URLs as the real API.
- **Fixture generator (`fixtures.ts`, seeded for reproducibility, all marked `source: 'synthetic'`):**
  - NDVI: baseline near 0.15 for bare soil plus one smooth bump per crop season, with 10 to 20 years of data and one or two drought years that cut the peak.
  - Brandenburg (illustrative): winter cereal green-up in spring, harvest in summer, bare late summer, modest rainfall with dry summers and sandy-soil water stress.
  - Punjab (illustrative): rice in the monsoon season, wheat in winter, short bare gaps between them, a falling water-storage trend.
  - Precipitation and ET monthly series, frost-free days and heat-stress days per year, a drought frequency, trends with p-values, and a small hotspots FeatureCollection.
  - Rotation scoring mock: a pure function of priorities and scenario so sliders visibly change ranks. Replace with the real endpoint at UI-11.

## A.6 State

| Store | Holds | Persisted |
| --- | --- | --- |
| `field` | Draft geometry, selected field id, current rotation by year | Yes (localStorage) |
| `priorities` | Six values 0 to 1, two toggles (can irrigate, limited machinery) | Yes |
| `scenario` | Rainfall percent, temperature offset, drought years per 10 | No (resets) |
| `ui` | Language, units, last-seen tooltips | Yes |

Server data lives only in TanStack Query, never copied into stores.

## A.7 Component specifications

| Component | Key props | States | Notes |
| --- | --- | --- | --- |
| `ProvenanceBadge` | `provenance: Provenance`, `compact?` | default, popover open | Shows source, native resolution, confidence. Warning style when `source === 'synthetic'` or confidence is low. Popover text explains the resolution in field terms |
| `StatTile` | `label`, `value`, `unit`, `status: ok/warn/risk`, `provenance`, `onOpen` | loading, no-data | Status uses colour plus an icon. Tap opens `ValueDialog` |
| `ValueDialog` | `title`, `current`, `status`, `usualRange`, `provenance` | open/closed | Mirrors the GrowCode sensor dialog: current value, status, range, OK |
| `HeroCard` | `place`, `days[]`, `advice[]` | loading, empty | Sky-blue card, two advice lines with status dots |
| `CropDisc` | `crop`, `selected`, `onSelect` | selected ring in `gc-primary` | Disc 56 px, label under it |
| `CropPicker` | `categories`, `value[]`, `max` | loading | Category headings, rows of 4, full-width Save |
| `PrioritySlider` | `label`, `help`, `value`, `onChange` | focus, disabled | Green track, 48 px thumb target, helper text below |
| `RotationCard` | `score: RotationScore`, `rank`, `onOpen` | current-rotation badge, low-confidence style | Sequence discs, score with range, `ConfidenceBar`, `ContributionBar`, one-line why |
| `ContributionBar` | `breakdown[]` | hover/tap shows indicator and value | Stacked bar, one segment per indicator, accessible text list below |
| `AccordionRow` | `title`, `defaultOpen?` | open, closed | White row, green outline, green bold label, chevron |
| `VerifyLocallyPanel` | `items[]` | always rendered | Cannot be hidden by props; empty list shows a generic reminder |
| `GlossaryTip` | `term` | open | Reads from `glossary.en.json` and the active locale |
| `ChartFrame` | `title`, `summary`, `provenance`, `children` | loading, no-data, error | Adds the text summary, the What does this mean tip and the How reliable is this expander to every chart |

## A.8 Charts

Use ECharts through one thin wrapper. All charts take data in the contract shape and read colours from tokens.

```ts
// charts/NdviTimeline.tsx (option builder)
const option = {
  grid: { left: 40, right: 12, top: 24, bottom: 48 },
  xAxis: { type: 'time' },
  yAxis: { type: 'value', min: -0.1, max: 1, name: 'NDVI' },
  series: [{
    type: 'line', showSymbol: false, connectNulls: false,
    data: s.dates.map((d, i) => [d, s.values[i]]),
    lineStyle: { color: tokens.color.primary, width: 2 },
    markArea: {
      silent: true,
      itemStyle: { color: 'rgba(160,110,60,0.18)' },
      data: bareWindows.map(w => [{ xAxis: w.start }, { xAxis: w.end }]),
    },
  }],
};
```

- **NdviTimeline:** line plus shaded bare windows; crop calendar as a thin band below the axis (a second grid with a custom series). Null values show as gaps, never zero.
- **WaterBalance:** grouped bars (rain, evapotranspiration) per month, with the difference as a line.
- **TrendRow:** small sparklines plus an arrow and the slope per year; show the p-value in the details, not on the main view.
- **ScenarioLines:** one line per rotation, score against rainfall change, with the current slider position marked.
- Colour-blind safe: pair every colour with a pattern, label or icon. Provide the same data as a visually hidden table inside `ChartFrame`.

## A.9 Map

- `FieldMap` wraps `react-map-gl/maplibre` with a light basemap. For offline use, load a small PMTiles file for both regions through the `pmtiles` protocol.
- `DrawControl` offers pin and polygon. On finish, compute area with `turf.area` (convert to hectares) and test coverage with `turf.booleanWithin` against region polygons in `coverage.ts`.
- Reject fields outside coverage with a plain message and a link to pick a demo field. Warn if the polygon is much smaller than the coarsest dataset pixel, with a pointer to the provenance popover.
- Layers: field outline (`gc-primary`), stress hotspots, erosion zones, management zones. `LayerSwitcher` toggles layers; `Legend` shows classes; an opacity slider controls overlays. Layers arrive as GeoJSON or tiles from `VITE_TILE_BASE`.

## A.10 i18n and glossary

- Keys are namespaced by screen (`home.hero.advice.dry`), never sentences-as-keys. English complete, German and Hindi scaffolded with a visible machine-translated flag.
- Number and date formats go through `lib/format.ts` using the active locale.
- Glossary terms to write first: NDVI, evapotranspiration, soil-moisture anomaly, root-zone moisture, bare-field days, frost-free days, heat-stress days, water balance, drought frequency, erosion risk index, native resolution, confidence, proxy. Each entry is two sentences at about a grade 6 reading level.

## A.11 Build slices (vertical, in this order)

Each slice ships working UI on mock data, with tests, before the next starts. IDs map to Plan 1 tasks.

| Slice | Plan 1 task | Build | Done when |
| --- | --- | --- | --- |
| 0 | UI-0 | Scaffold, tokens, Tailwind, fonts, AppBar, BottomNav with FAB, router with placeholder pages | Shell matches the screenshots at 390 px and 1280 px |
| 1 | UI-1 | `client.ts`, generated types, MSW, fixtures for both regions | Every endpoint returns typed mock data; fixtures validate against the contract |
| 2 | UI-2 | Common components and a `/dev/components` showcase page | Each component renders loading, empty and error variants |
| 3 | UI-3 | Home: hero, RotationGuide grid, notice, empty state | Matches GrowCode home pattern; works with no field |
| 4 | UI-4 | Field setup: map draw, CropPicker, priorities | Field and choices persist across reload; out-of-coverage is rejected |
| 5 | UI-5 | Diagnosis: StatTiles, ValueDialog, three charts, map layers | Every number carries a ProvenanceBadge; bare windows shaded |
| 6 | UI-6 | Rotations list, RotationCard, ContributionBar, detail accordions, priorities drawer | 3 or more cards; sliders change rank; Verify locally always visible |
| 7 | UI-7 | Scenario lab with debounced scoring and rank-change tags | Moving rainfall to -20% changes at least one rank in the fixtures |
| 8 | UI-8 | Assistant stub with suggested questions and tool-call display | Canned replies render; layout ready for streaming |
| 9 | UI-9 | Methods, Profile, language switcher, glossary | EN complete; DE and HI keys load |
| 10 | UI-10 | PWA, accessibility, mobile pass, Playwright flows | Passes the checks in A.12 and A.13 |
| 11 | UI-11 | Turn mocks off, fix contract mismatches | Contract tests green against the real API |

## A.12 Testing

- **Unit (Vitest):** formatters, status mapping, scoring-mock function, coverage check, debounce behaviour.
- **Component (Testing Library):** each common component's variants; `ProvenanceBadge` must render for any numeric display; `VerifyLocallyPanel` renders even with an empty list.
- **Contract:** validate every fixture and every real response against schemas generated from the OpenAPI file (zod or the generated validators).
- **Accessibility:** axe on each page through Playwright, no serious or critical violations; keyboard-only run through the main flow.
- **Playwright smoke flows:**
  1. *Brandenburg flow:* open Home, pick the Brandenburg demo field, confirm the crop sequence, save priorities, see Diagnosis tiles with provenance badges, open a value dialog, go to Rotations, see at least 3 cards.
  2. *Priorities flow:* on Rotations, raise Save water, confirm the order or scores change, open a card and check Verify locally is visible.
  3. *Scenario and Punjab flow:* switch to the Punjab demo field, run the rainfall slider to -20%, see a rank-change tag, switch language to Hindi and confirm labels change.
- **Visual check:** screenshots at 375, 390 and 1280 px compared by eye with the GrowCode screens (A.15).

## A.13 Performance and PWA

- Initial JavaScript budget: aim for about 250 KB gzipped before route chunks; map and chart code load lazily.
- Images: compress illustrations, use WebP or SVG, set explicit sizes to avoid layout shift.
- `vite-plugin-pwa`: precache the shell, fonts and demo fields; cache API responses stale-while-revalidate; show an offline banner and the last cached result.
- Target first paint under 3 seconds on a mid-range phone over a throttled connection.

## A.14 Common pitfalls

- Showing a number without its provenance. Use `StatTile` and `ChartFrame` so it cannot happen.
- Encoding status by colour alone. Always add an icon or label.
- Drawing zero for missing data. Show gaps and a reason.
- Calling `fetch` outside `client.ts`, which breaks the mock switch.
- Hard-coding hex colours or strings. Use tokens and i18n keys.
- Treating SMAP or GRACE as field-level truth. Show native resolution and a plain caveat.
- Letting the assistant or any card imply a recommendation is final. The Verify locally panel stays on every rotation.

## A.15 Visual QA checklist against GrowCode

- Solid green app bar with white title, back chevron and globe language switch.
- Page background near-white with a faint lavender tint; cards white with soft shadow.
- Bold green section headings.
- Round grey crop discs, 4 per row, green ring when selected, full-width green Save.
- Blue hero card with pin, three day tiles and two advice lines with status dots.
- Three-column feature grid with illustrated icons.
- White accordion rows with green outline and green bold labels.
- Indicator tiles that open a centred dialog with current value, status, range and OK.
- Bottom bar with four icons and the raised round green plus button.

## A.16 Prompts for the UI agent

**Master prompt (attach Section 0, Plan 1 and this appendix):**

```
You are the UI agent for GrowCode Rotation Advisor. Build web/ as a React + TypeScript PWA
that matches the GrowCode look described in Plan 1 section 1.1 and the tokens in design/tokens.ts.
Work one slice at a time from Appendix A.11, starting with the slice I name. For each slice:
1) list the files you will create or change, 2) implement on mock data only, 3) add tests from A.12,
4) run lint, type-check, tests and build, 5) open a PR named ui/<task-id> with screenshots at 390
and 1280 px and a note on assumptions. Never call fetch outside api/client.ts. Never show a number
without a ProvenanceBadge. Never hard-code colours or strings. Do not edit contract/, backend/ or ml/.
If the contract needs a change, stop and ask the Lead.
```

**Slice prompt template:**

```
Slice <N> (Plan 1 task <UI-N>): build <what> per Appendix A.11 and the screen spec <S#> in Plan 1.
Use components from A.7. Done when: <done-when text>. Out of scope: real data, new endpoints.
Return: PR link, list of files changed, how to run it, what is still mocked.
```

**Suggested first message to the agent:** run the master prompt with Slice 0 and Slice 1, because everything else depends on the shell, the tokens and the typed mock layer.
