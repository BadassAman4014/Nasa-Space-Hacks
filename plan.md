# Field Shift — Master Plan

> **NASA Space Apps Challenge: "Field Shift: Adapting Farms with NASA Data"**
> Codebase: `D:\onesoil\Nasa-Space-Hacks\` — React 18 + Vite + FastAPI + SQLite + GeoPandas

---

## What This App Does

Help farmers earn more from the same land with less waste, using NASA satellite data and German market data. EU policy rules (DüV, GLÖZ 7, CAP) run as the invisible engine — the farmer sees a recommendation, a dose, a window to act. Never a form.

**Gap it fills:** No existing tool combines NASA physics (no hardware probes) + public fertilizer law (no expensive ERP) + German grain prices + field-first UX in one place.

---

## 6 Features — Non-Negotiable

| # | Feature | Page |
|:--|:---|:---|
| 1 | **Field Map** | Main map with visual risk indicators + weather card |
| 2 | **Field Health Trend** | NDVI trend, erosion, leaching, water, action steps |
| 3 | **Crop Planner** | 3 rotation strategies (multi-year sequences): current path / soil-building / diversified income; nutrient plan (DBE) for selected strategy |
| 4 | **Documentation** | Fertilizer calculation (DBE), tractor map export, 1-click compliance PDF |
| 5 | **AI Advisor** | Chatbot floating on all pages, grounded in field's real data |
| 6 | **Language** | English native, German toggle in settings |

Everything else is **NOT NEEDED — TO BE REMOVED**.

---

## Navigation (Final)

```
Sidebar:
├── 🗺️  Field Map
├── 📈  Field Health
├── 🌱  Crop Planner
├── 📄  Documentation
└── [AI Advisor — floating button, not a nav slot]

Footer:
└── ⚙️  Settings   ← Language toggle, farm setup (first run only), field import
```

---

## 1. What Exists in the Codebase

### Backend — Operational

| Service | Status |
|:---|:---|
| Field & Farm CRUD (`user_farms_repo`) | ✅ Operational |
| DFBK Brandenburg field boundaries | ✅ Operational |
| SoilGrids v2.0 (sand, clay, SOC, pH, CEC) | ✅ Operational |
| NASA SMAP soil moisture | ✅ Operational |
| NASA GPM / IMERG precipitation | ✅ Operational |
| NASA POWER (GDD, temperature, solar) | ✅ Operational |
| Open-Meteo (weather, forecast) | ✅ Operational |
| Sentinel-2 L2A NDVI + productivity zones | ✅ Operational |
| SRTM / Copernicus DEM (slope, elevation) | ✅ Operational |
| Crop Recommendations endpoint | 🔶 Stub — wire to XGBoost planner |
| Reports endpoint | 🔶 Stub — wire to PDF generator |
| Climate Scenarios endpoint | 🔶 Stub — wire to what-if tab |

### Backend — NOT NEEDED, TO BE REMOVED

| Service | Reason |
|:---|:---|
| `nasa_challenge/` catalog (23-dataset client) | Most datasets unused in the 6 features; individual clients (SMAP, GPM, POWER) already integrated separately |
| `field_segmentation/` (U-Net MobileNetV3) | PyTorch not installed; not part of any of the 6 features |
| `api/farmer.py` router | Farm preferences handled in Settings onboarding flow, not a standalone API feature |
| USDA CropScape CDL client | US-specific, not relevant for German Brandenburg demo |
| USDA SSURGO client | US soil database, SoilGrids already covers this globally |
| MODIS / Landsat client | Sentinel-2 covers the same use case at better resolution (10m vs 250m); Sentinel-2 already operational |
| ERA5-Land Reanalysis client | Open-Meteo archive covers historical climate baseline; ERA5 is redundant here |

### Frontend — Operational

| Component | Status |
|:---|:---|
| Sidebar + shell | ✅ Built — update to 6 items |
| Dashboard (map, field cards) | ✅ Built — becomes Field Map |
| Field Analytics (StatusTab, FieldReportTab, YieldAnalysisTab, PrescriptionMapsTab) | ✅ Built — move into Field Health |
| Rotation Studio | 🔶 Stub — becomes Crop Planner, wire to engine |
| Reports & Evidence | 🔶 Demo data — becomes Documentation |

### Frontend — NOT NEEDED, TO BE REMOVED

| Component | Reason |
|:---|:---|
| `ThreeSatelliteViewer.tsx` | No farmer utility |
| `ThreeCloudOverlay.tsx` | No farmer utility |
| `DataCatalogTab.tsx` | Replace with inline data source footnotes per metric |
| Weather page (standalone) | Weather card moves into Field Map; weather data moves into Field Health tabs |
| Environmental Profile page (standalone) | SMAP + GPM + MODIS views move into Field Health tabs |
| Scenario Simulator (standalone page) | ❌ NOT NEEDED — removed entirely |
| Farmer Profile (main nav item) | Move to Settings — first-run setup only |
| Field Explorer (main nav item) | Move to Settings — field import step only |

---

## 2. Data Sources (Only What's Used)

| Source | Used in |
|:---|:---|
| **Sentinel-2 L2A** | Field Health (NDVI trend, productivity zones, erosion cover factor), Documentation (winter cover proof in PDF) |
| **NASA SMAP** | Field Map (moisture indicator), Field Health (leaching risk, seeding window) |
| **NASA GPM / IMERG** | Field Map (rain indicator), Field Health (RUSLE rainfall erosivity, leaching detection) |
| **NASA POWER** | Field Health (GDD, frost risk), Crop Planner (XGBoost climate features) |
| **Open-Meteo** | Field Map (weather card, 7-day forecast), Field Health (precipitation tab) |
| **SoilGrids v2.0** | All features — AWC calculation, Nmin estimate for DBE, XGBoost soil features, RUSLE erodibility |
| **SRTM / DEM** | Field Health (RUSLE slope factor, erosion risk) |
| **DüV Schedule 4 (static tables)** | Fertilizer calculation (DBE) → feeds Crop Planner N-ceiling + Documentation audit table + Field Map N-status |
| **GLÖZ 7 rules** | Crop Planner — hard constraint: illegal crop sequences eliminated before scoring |
| **CAP Eco-Scheme rules** | Crop Planner — farm-level optimizer: flags extra subsidy income when achievable |
| **BLE weekly grain prices** | Crop Planner — income estimate on crop cards; XGBoost market feature |
| **Destatis agricultural prices** | Crop Planner — fallback if BLE parser fails |

---

## 3. Feature Specifications

### Field Map

**What the farmer sees:**
- Satellite map — all fields coloured by current soil moisture (Green / Yellow / Red)
- Toggleable overlays: nitration risk zones, leaching risk, moisture gradient
- Tap a field → card shows:
  - Soil moisture status + days since last rain
  - Soil health score (0–100)
  - Nitrogen status this season (from fertilizer calculation — plain number, no legal language)
  - Weather card: today's conditions + 3-day forecast
- Quick links from field card → Field Health | Crop Planner | Documentation

**Data in:** DFBK boundaries, SMAP, GPM, SoilGrids, Open-Meteo, DBE N-ceiling

---

### Field Health Trend

**What the farmer sees:**
- **Vegetation Trend (3 years):** Sentinel-2 NDVI chart — improving / stable / declining + one plain sentence
- **Yield Zones:** Satellite-derived productivity map coloured high / medium / low
- **Erosion Risk:** Traffic light + sentence explaining why and what to do
- **Leaching Risk:** Alert if heavy rain followed N-application; seeding window status
- **Soil Moisture Trend:** 30-day SMAP root-zone chart
- **Action Cards:** Plain-language steps — "Good week to sow cover crop" / "Soil compaction risk in south strip — consider rye"

**Models — no ML training needed:**

| Analysis | Method | Inputs |
|:---|:---|:---|
| NDVI trend | Linear regression on time series | Sentinel-2 NDVI history |
| Erosion risk | RUSLE formula: R × K × LS × C | R: GPM rainfall · K: SoilGrids clay/sand · LS: DEM slope · C: Sentinel-2 NDVI |
| Leaching risk | Rule-based index | SoilGrids AWC + GPM event intensity + N-application timing |

**Data in:** Sentinel-2, NASA SMAP, NASA GPM, NASA POWER, SoilGrids, SRTM

---

### Crop Planner

**What the farmer sees:**

Three **multi-year rotation sequences** compared side by side — each strategy covers 5 years so the farmer can see the full arc, not just next season. The existing path is always shown first so the farmer can compare it against the alternatives.

**Tab 1 — Rotation Strategies**

```
                   2024 (actual) │ 2025 (actual) │ 2026 (plan) │ 2027 (outlook) │ 2028 (outlook)
                   ──────────────┼───────────────┼─────────────┼────────────────┼───────────────
Strategy A         Winter Wheat  │ Winter Wheat  │ Winter Wheat│ Winter Wheat   │ Winter Wheat
Current path       ─────────────────────────────────────────────────────────────────────────────
⚠️ GLÖZ violation  GLÖZ 7: same crop 5 consecutive years — ILLEGAL from 2026 onward
                   Avg income:   ~€640/ha/yr (3-yr)   Fertilizer 2026: 160 kg N/ha
                   Pest risk:    HIGH — continuous wheat increases Septoria pressure

Strategy B         Winter Wheat  │ Winter Wheat  │ Field Peas  │ Winter Barley  │ Winter Wheat
Soil-building      ─────────────────────────────────────────────────────────────────────────────
✅ GLÖZ compliant  Avg income:   ~€690/ha/yr (3-yr)   Fertilizer 2026: 0 kg N/ha (peas fix own N)
                   Soil impact:  Peas raise SOC, cut 2027 N-dose by ~30 kg N/ha
                   Pre-crop N-credit 2027: +40 kg N/ha carried from peas into barley
                   Evidence: NASA POWER GDD + SoilGrids AWC → peas viable on this soil

Strategy C         Winter Wheat  │ Winter Wheat  │ Oilseed Rape│ Winter Barley  │ Field Beans
Diversified income ─────────────────────────────────────────────────────────────────────────────
✅ GLÖZ compliant  Avg income:   ~€760/ha/yr (3-yr)   Fertilizer 2026: 170 kg N/ha
✅ Eco-scheme flag  5+ botanical families over 5 years → +€60/ha CAP ÖR 2 subsidy unlocked
                   Pest risk:    LOW — rape breaks the cereal cycle
                   Market note:  Rape price 480 €/t (BLE, [date]) — currently favourable
```

> Income = BLE current price × Sentinel-2 productivity-zone-adjusted yield. Not a guarantee. Data date always shown.

**How the 3 strategies are produced:**

```
Step 1 — Hard legal filter (GLÖZ 7 hard constraint):
  Eliminate any sequence where the same crop appears 3 consecutive years on the same parcel.
  Source: SQLite crop history (2022–2025) + proposed sequence.
  Strategy A is ALWAYS shown as-is, with violation flag if illegal.

Step 2 — XGBoost scores each candidate crop at each sequence position:
  Features per position: soil (sand%, clay%, SOC, pH, AWC from SoilGrids),
    climate (GDD, rainfall, drought stress days from NASA POWER + SMAP),
    policy (N-ceiling, Red Zone flag from DüV),
    history (previous crop, years since legume from SQLite),
    market (BLE price, price volatility),
    terrain (slope from DEM)
  Output: suitability score [0–1] per crop at each position.
  SHAP top-2 features → plain-language reason string on each sequence card.

Step 3 — Assemble 3 strategies from scored candidate crops:
  Strategy A: farmer's existing crop history extended forward (always shown first).
  Strategy B: maximise soil health objective (prioritise legume insertion, SOC trajectory).
  Strategy C: maximise 3-year income (BLE price × yield × eco-scheme subsidy).

Step 4 — Pre-crop N-credit carry-forward:
  For each strategy, DBE calculator propagates N-credits across the sequence.
  Peas in 2026 → +40 kg N/ha credit feeds into 2027 N-ceiling automatically.

Step 5 — Farm-level CAP optimizer (OR-Tools):
  Checks all fields in the farm — does the full crop mix across fields unlock eco-scheme?
  "Eco-scheme flag" shown only when genuinely achievable at farm level.
```

**XGBoost training data (all free/public):**
- LUCAS Topsoil Survey (EU JRC) — soil + land-use records across EU
- Destatis crop yield statistics — German regional yields 2000–2024
- LfL Bayern annual variety trial reports — yield by soil class
- Synthetic augmentation from agronomic equations (AWC × GDD × N-factor)
- Ships as `crop_scorer.pkl`; retrains as farmer logs actual seasons

**Tab 2 — Nutrient Plan (DBE) — for the SELECTED rotation strategy**

Step-by-step fertilizer calculation for each year in the selected sequence. Pre-crop credits carry forward automatically across years:

```
Selected: Strategy B — Soil-building rotation

2026 — Field Peas:
  Base N-demand (peas, 3.5 t/ha target):     0 kg N/ha   ← N-fixing legume
  Legal maximum N:                            0 kg N/ha
  Pre-crop credit stored for 2027:          +40 kg N/ha

2027 — Winter Barley (using peas credit):
  Base N-demand (barley, 6 t/ha target):   180 kg N/ha
  + Yield adjustment:                       + 10 kg N/ha
  − Pre-crop credit (peas 2026):            − 40 kg N/ha
  − Soil Nmin estimate (SoilGrids 0–60cm):  − 25 kg N/ha
  × Red Zone reduction (−20%):              × 0.80
  ─────────────────────────────────────────────────────
  Legal maximum N:                           100 kg N/ha
  Split: 60 kg (Feb) + 40 kg (stem extension)
  Calculated per Schedule 4 (German Fertilizer Ordinance)

2028 — Winter Wheat:
  Base N-demand (wheat, 7.5 t/ha target):  220 kg N/ha
  + Yield adjustment:                       + 15 kg N/ha
  − Pre-crop credit (barley 2027):          − 10 kg N/ha
  − Soil Nmin estimate:                     − 35 kg N/ha
  × Red Zone reduction (−20%):              × 0.80
  ─────────────────────────────────────────────────────
  Legal maximum N:                           152 kg N/ha
  Split: 90 kg (Feb) + 62 kg (stem extension)
  Calculated per Schedule 4 (German Fertilizer Ordinance)
```

Per-zone Sentinel-2 productivity map shows spatial variation in N-dose across the field — high-yield zones receive more within the legal ceiling, low-yield zones receive less.

---

### Documentation

**What the farmer sees:**

**Tab 1 — Fertilizer Requirement (DBE)**

Step-by-step calculation — same formula as DELOS, built from DüV Schedule 4 (public German law). Showing the steps builds transparency and trust:

```
Base N-demand  Winter barley (6 t/ha):   200 kg N/ha
+ Yield adjustment   (+0.5 t target):    + 12 kg N/ha
− Pre-crop credit    (rapeseed 2025):    − 10 kg N/ha
− Soil Nmin estimate (SoilGrids 0–60cm): − 30 kg N/ha
× Red Zone reduction (−20%):             × 0.80
─────────────────────────────────────────────────────
Legal maximum N application:              138 kg N/ha
Recommended split: 83 kg (April) + 55 kg (stem extension)
Calculated per DüV Schedule 4
```

**Tab 2 — Tractor Map (VRA Export)**
- Download ISO-XML or Shapefile
- Per-zone N-dose from Sentinel-2 productivity zones with the legal N-ceiling already embedded per zone
- Compatible: John Deere Operations Center, Fendt, Amazone, ISOBUS-standard

**Tab 3 — Compliance PDF (1-Click)**
- Jinja2 + WeasyPrint — one download button
- Contents: fertilizer calculation table · 3-year crop log (rotation compliance proof) · Sentinel-2 NDVI winter cover chart (bare-soil compliance proof)
- Zero extra data entry — all from normal app use during the season

**DBE output also feeds:**
- Crop Planner Layer 1 (legal N-ceiling per crop)
- Field Map field card (N-status indicator)
- VRA tractor map (zone N-doses capped to ceiling)

---

### AI Advisor

Floating button on every page. Opens a drawer. No separate nav slot.

**Context injected per request:**
```
Field name, area, location
Soil: texture, plant-available water capacity, pH, organic carbon
Moisture: SMAP status, days since last rain
Weather: current temp, 7-day precipitation (Open-Meteo)
Policy: legal N-ceiling this season, Red Zone status
History: crop 2024, crop 2025
Season: growing degree days accumulated, frost risk (NASA POWER)
```

**Model:** Gemini `gemini-3.5-flash` (configurable via `GEMINI_ADVISOR_MODEL`; `gemini-2.5-flash` is retired for new API keys)

**Rules:**
- Always cite which data source the answer draws from
- Never promise a specific profit figure
- Plain language — no raw sensor values in the answer text
- If uncertain: recommend consulting a local agronomist

---

## 4. Backend Service Structure (Final)

```
backend/app/
  api/
    fields.py          ✅ Field CRUD + boundary assignment
    farms.py           ✅ Farm management
    boundaries.py      ✅ DFBK Brandenburg parcels
    field_analytics.py ✅ Sentinel-2, GDD, NDVI, zones, elevation
    environment.py     ✅ NASA SMAP, GPM
    soil.py            ✅ SoilGrids v2.0
    weather.py         ✅ Open-Meteo & NASA POWER
    recommendations.py 🔶 Stub → wire to crop_planner/scorer.py
    reports.py         🔶 Stub → wire to compliance_report.py
    scenarios.py       ❌ NOT NEEDED — What if? tab removed; rotation engine replaces this
    chatbot.py         🆕 POST /api/chatbot/message (streaming)
    farmer.py          ❌ NOT NEEDED — remove
    nasa_challenge.py  ❌ NOT NEEDED — individual clients already integrated separately

  services/
    user_farms_repository.py    ✅ SQLite farm & field storage
    weather_station_service.py  ✅ Open-Meteo & NASA POWER
    nasa/smap/                  ✅ SMAP client
    nasa/gpm/                   ✅ GPM client
    soilgrids/                  ✅ Global raster extraction
    field_analytics/            ✅ NDVI, GDD, productivity zones, elevation
    field_boundaries/           ✅ DFBK GeoPackage & geometry
    field_segmentation/         ❌ NOT NEEDED — U-Net, PyTorch not installed, not in 6 features
    nasa_challenge/             ❌ NOT NEEDED — 23-dataset catalog unused; individual clients sufficient

    policy/
      duev_catalog.py           🆕 DüV Schedule 4 crop N-demand tables (public law)
      dbe_calculator.py         🆕 Fertilizer requirement formula → legal N-ceiling + table rows
      gloez_checker.py          🆕 Rotation hard constraint validator (3-year monoculture ban)
      cap_schemes.py            🆕 Eco-scheme eligibility check (farm-level)

    crop_planner/
      scorer.py                 🆕 XGBoost suitability scorer (loads crop_scorer.pkl)
      crop_scorer.pkl           🆕 Pre-trained model (LUCAS + Destatis + LfL + synthetic data)
      feature_builder.py        🆕 Assembles feature vector from all data sources per field
      farm_optimizer.py         🆕 OR-Tools CP-SAT — farm-level eco-scheme solver

    market/
      ble_client.py             🆕 BLE weekly price parser + Destatis fallback + SQLite cache

    field_health/
      ndvi_trend.py             🆕 Linear regression on Sentinel-2 NDVI time series
      rusle_calculator.py       🆕 RUSLE erosion index (GPM × SoilGrids × DEM × Sentinel-2)
      leaching_index.py         🆕 Leaching risk score (AWC + GPM event + N-timing)

    chatbot_service.py          🆕 Gemini API orchestrator + field context assembly
    compliance_report.py        🆕 Jinja2 + WeasyPrint PDF generator
```

**New API endpoints:**
```
POST /api/chatbot/message                🆕 Gemini streaming, field context injected
GET  /api/fields/{id}/policy/status      🆕 N-ceiling, Red Zone flag, rotation compliance state
GET  /api/fields/{id}/dbe               🆕 Step-by-step fertilizer calculation result
GET  /api/fields/{id}/health            🆕 NDVI trend, erosion score, leaching score, action strings
POST /api/recommendations/generate      🔶 Wire → 3-layer crop planner → 3 crop cards
GET  /api/fields/{id}/compliance/vra-map 🆕 ISO-XML / Shapefile tractor export
GET  /api/fields/{id}/compliance/report  🆕 WeasyPrint PDF compliance report
```

---

## 5. Frontend Component Structure (Final)

```
src/components/
  shell/
    Sidebar.tsx                  ✅ Update → 4 nav items + floating advisor + footer settings

  field-map/
    FieldMapDashboard.tsx        🔀 From Dashboard.tsx
    FieldCard.tsx                🔀 From FieldEnvironmentalCard.tsx
    FieldSoilCard.tsx            ✅ Keep
    WeatherCard.tsx              🔀 Extracted from WeatherView.tsx

  field-health/
    FieldHealthView.tsx          🆕 Merge host: 4 tabs
    VegetationTrendTab.tsx       🔀 From FieldReportTab.tsx
    YieldZonesTab.tsx            🔀 From YieldAnalysisTab.tsx
    ErosionLeachingTab.tsx       🆕 RUSLE + leaching index + action cards
    SoilMoistureTab.tsx          🔀 From Environment SMAP tab

  crop-planner/
    CropPlannerView.tsx          🔀 From RotationStudio inline
    RotationStrategiesTab.tsx    🆕 3-strategy multi-year grid (Tab 1)
    NutrientPlanTab.tsx          🆕 DBE step-by-step per year for selected strategy (Tab 2)

  documentation/
    DocumentationView.tsx        🔀 From Reports inline
    FertilizerCalculationTab.tsx 🆕 Step-by-step DBE display
    TractorMapTab.tsx            🆕 ISO-XML / Shapefile download
    CompliancePdfTab.tsx         🔀 From Reports, wire to WeasyPrint

  advisor/
    AdvisorDrawer.tsx            🆕 Floating AI drawer (all pages)
    ChatMessageList.tsx          🆕 Streaming message list

  settings/
    FarmSetupForm.tsx            🔀 From FarmerProfile inline (first-run only)
    FieldImportView.tsx          🔀 From FieldExplorerView (setup step)
    LanguageSelector.tsx         🆕 EN/DE toggle

  — REMOVED —
  ThreeSatelliteViewer.tsx       ❌ NOT NEEDED
  ThreeCloudOverlay.tsx          ❌ NOT NEEDED
  DataCatalogTab.tsx             ❌ NOT NEEDED
```

---

## 6. Implementation Roadmap

### Phase 1 — Policy Engine + Fertilizer Calculation + AI Advisor
*Core data wired. Advisor answers real questions. Fertilizer calculation available.*

- [ ] `duev_catalog.py` — DüV Schedule 4 N-demand tables for 12 German arable crops
- [ ] `dbe_calculator.py` — fertilizer requirement formula: base N + yield adj − pre-crop credit − Nmin × Red Zone factor
- [ ] `gloez_checker.py` — rotation hard-block from SQLite crop history
- [ ] `cap_schemes.py` — eco-scheme eligibility check
- [ ] `ble_client.py` — BLE weekly price parser, cached to SQLite; Destatis fallback
- [ ] `GET /api/fields/{id}/policy/status` — N-ceiling + rotation compliance state
- [ ] `GET /api/fields/{id}/dbe` — full fertilizer calculation result
- [ ] `chatbot_service.py` + `chatbot.py` router + `AdvisorDrawer.tsx` + `ChatMessageList.tsx`

### Phase 2 — Crop Planner (XGBoost + Rotation Engine)
*3 real, field-specific multi-year rotation strategies.*

- [ ] Collect training data: LUCAS Topsoil Survey, Destatis Ernte statistics, LfL Bayern trial PDFs
- [ ] Generate synthetic augmentation from agronomic equations
- [ ] Train and export `crop_scorer.pkl`
- [ ] `feature_builder.py` — assemble feature vector per field-year from live data
- [ ] `scorer.py` — load model, produce 3 rotation strategies (current path / soil-building / diversified income)
- [ ] `farm_optimizer.py` — OR-Tools eco-scheme farm-level check (5+ botanical families flag)
- [ ] Wire `POST /api/recommendations/generate` → returns 3 rotation sequences with per-year DBE
- [ ] `RotationStrategiesTab.tsx` — 5-year grid, violation flag, income, pest risk, priority sliders
- [ ] `NutrientPlanTab.tsx` — DBE table per selected strategy with pre-crop N-credit carry-forward

### Phase 3 — Field Health + Documentation Deliverables
*Health engine live. Downloads available.*

- [ ] `ndvi_trend.py` — linear regression on Sentinel-2 NDVI
- [ ] `rusle_calculator.py` — RUSLE from GPM + SoilGrids + DEM + Sentinel-2
- [ ] `leaching_index.py` — AWC + GPM event + N-timing risk score
- [ ] `GET /api/fields/{id}/health` — trend, erosion, leaching, action strings
- [ ] `FieldHealthView.tsx` — 4-tab view with action cards
- [ ] `GET /api/fields/{id}/compliance/vra-map` — ISO-XML / Shapefile, Sentinel-2 zones + N-ceiling
- [ ] `GET /api/fields/{id}/compliance/report` — Jinja2 → WeasyPrint PDF
- [ ] `FertilizerCalculationTab.tsx`, `TractorMapTab.tsx`, `CompliancePdfTab.tsx`

### Phase 4 — Navigation Cleanup + Language Toggle
*9 pages → 4. Bloat removed. Language option added.*

- [ ] `Sidebar.tsx` — 4 nav items, floating advisor, settings in footer
- [ ] Page intro component on each page (one sentence, what it does)
- [ ] Remove ThreeSatelliteViewer, ThreeCloudOverlay, DataCatalogTab from render tree
- [ ] Data source footnotes on each metric card ("via NASA SMAP · 9km · 3 days ago")
- [ ] Move FarmerProfile + FieldExplorer to Settings
- [ ] `react-i18next` — EN/DE toggle in Settings footer

---

## 7. Design Principles

1. **Policy runs silently** — legal rules shape the output; the farmer sees a dose, a crop, an income range.
2. **Show fertilizer calculation step-by-step** — transparency builds trust that the numbers are correct.
3. **Income is an estimate, not a promise** — always show BLE price date; never a fixed number.
4. **Traffic lights, not tables** — moisture: Green / Yellow / Red. Timing: Act now / Wait.
5. **Cite data quietly** — every metric shows its source below: "via NASA SMAP · 9km · 3 days ago".
6. **1-click for paperwork** — PDF and tractor map are single downloads; data comes from normal app use.
7. **Advisor disclaims** — cites its data source, never promises profit, recommends local agronomist when uncertain.

---

## 8. Risks

| Risk | Mitigation |
|:---|:---|
| DüV / rotation rules differ by German state | Brandenburg rules are default; flag: "Rules may differ in other states — check with your local chamber" |
| BLE price parsing breaks | Destatis API fallback; last-known price cached with visible stale date |
| SMAP data 2–3 day lag | Show "as of [date]" on every SMAP tile; pair with real-time Open-Meteo |
| XGBoost accuracy | LUCAS EU soil data covers Germany; LfL trial data grounds German estimates; improves with farmer-logged seasons |
| AI advisor hallucination on legal advice | Restricted to field's factual data; mandatory disclaimer; no legal guarantees |
