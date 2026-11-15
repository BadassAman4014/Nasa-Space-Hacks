# Field Analytics: Reference Analysis, Data Plan and Implementation Plan

Status: investigation complete, implementation not started. Screenshots are in `scratch/ref/`.

## 1. Reference analysis (OneSoil Yield, demo field "Test field #1", 34.9 ha)

Explored in the user's signed-in Chrome session. The reference URL is OneSoil's built-in demo field.

| Area | What it shows | Type | Data behind it |
|---|---|---|---|
| Map | Field polygon on satellite basemap; colouring of fields by a chosen metric ("Einfärbung") | Map, vector + raster | Field boundaries; Sentinel-2 scenes; per-field metric |
| Layer menu | Productivity map, soil brightness, relief, satellite image; vegetation indexes NDVI, NDRE, MSAVI, RECI, MCARI, PRI; moisture indexes NDMI, SMI, NDWI | Map raster overlays | Sentinel-2 bands per scene; multi-season composites; DEM |
| Status tab | Latest image date, NDVI map with 0-1 legend, NDVI chart for the season, accumulated precipitation (516 mm / 318 days), growing degree days (+2340, days between +5 and +30 °C), current weather chip (+4 °C, 0 mm, 4 m/s) | Map + charts + metrics | Sentinel-2 NDVI time series; precipitation and temperature series; forecast |
| Field report tab | Productivity map (min-max ramp, red-yellow-green); "64 % of field area is stable"; "6/9 seasons considered"; zone table High 10.35 ha (29.7 %, +26 %), Medium 12.46 ha (35.7 %, 0), Low 12.09 ha (34.6 %, -13 %); thumbnails of the NDVI image chosen per season (Oct 2017 ... Aug 2025) with edit/exclude; correlation panel: productivity vs soil brightness vs relief; soil analysis maps (organic matter classes, pH, potassium) | Map + metrics + table | One peak-season NDVI image per year for ~9 years; bare-soil Sentinel-2 composite; DEM; uploaded lab results |
| Application maps / Data / Yield analysis | VRA prescriptions, uploads (yield, soil samples, EC) | Out of scope | User uploads |

How OneSoil builds productivity zones (from its help centre): pick one image per season at the growth stage where NDVI correlates with yield, keep seasons where high and low areas repeat, classify into High/Medium/Low. A field is "stable" if zones repeat over at least 3 seasons and the stable area exceeds 40 % of the field.

Weather in OneSoil comes from a commercial provider (WorldWeatherOnline). Their API endpoints seen in the network log (`/ndvi-chart`, `/precipitations`, `/temperatures`, `/weather`, `/search-clean-dates`, `mbtiles`) confirm the split: per-field time series as JSON, map layers as tiles.

## 2. Data sources (verified today against the live services)

| Source | Provides | Used by | Resolution / latency | Access | Verified |
|---|---|---|---|---|---|
| DFBK Brandenburg | Field blocks | Field map | Parcel polygons, yearly | Local GeoPackage (90,756 blocks), dl-de/by-2-0 | Yes |
| Sentinel-2 L2A (Earth Search STAC, COG) | B04/B08 (NDVI), B8A/B11 (NDMI), SCL cloud mask, true colour | NDVI trend, yield zones, in-field moisture gradient, bare-soil detection | 10-20 m, ~5 days | Public, no key | Yes: 16 scenes for the Cottbus field Apr-Oct 2026, read path works |
| SMAP L3 Enhanced, SPL3SMP_E.006 (AppEEARS point extract) | Measured surface soil moisture, AM/PM passes, quality flags | Moisture status, moisture trend (measured) | 9 km grid, daily with gaps, ~2 days lag | Earthdata login | Yes: 42 days for the field, real values |
| SMAP L4, SPL4SMGP.008 (AppEEARS) | Modelled root-zone and surface moisture, root-zone percentile vs climatology | 30-day root-zone trend, traffic light | 9 km, 3-hourly, ~3 days lag | Earthdata login | Yes: 328 values for the field |
| GPM IMERG Late Daily, GPM_3IMERGDL.07 (cloud OPeNDAP subset) | Satellite precipitation | Days since rain, rain history, leaching alert | 0.1° (~11 km), daily, latest = yesterday | Earthdata login + GES DISC EULA (approved) | Yes: subset returns a few KB |
| GPM IMERG Final, GPM_3IMERGDF.07 | Gauge-calibrated precipitation | Long history only | Latest granule 2025-09-30 | Same | Yes, but not current |
| SoilGrids v2.0 | Texture, pH, SOC, CEC, N, bulk density | Soil health score, leaching and erosion factors | 250 m | Public | Already integrated |
| Copernicus DEM 30 m | Elevation, slope | Erosion risk | 30 m | Public | Already integrated (`elevation_service.py`) |
| Open-Meteo | Current weather, 3-7 day forecast, ET0 | Field card, rain-after-fertiliser alert | ~1-11 km model | Public, fair-use | Already integrated |
| DWD warnings | Official frost/storm/rain warnings | Field card, action cards | Kreis level | Public | Already integrated |
| DBE N-ceiling (DüV Düngebedarfsermittlung) | Legal N limit | Nitrogen status | Per field, per season | No public API. Needs crop, yield target, previous crop, Nmin from the farmer | Not available |
| Red Zone (nitrate-polluted areas, Brandenburg) | Whether the field is in a "rotes Gebiet" | Nitrogen risk overlay | Polygons | State geoportal | Not yet checked |

Important limits:
- SMAP and GPM cells (9-11 km) are larger than any field. Their values describe the area around the field, not differences inside it.
- SMAP L3 has gaps (orbit) and needs its quality flag. Example: 2026-10-02 AM reports 0.52 m³/m³, which is implausible for sandy loam and must be filtered.
- IMERG Late is satellite-only, not gauge-corrected. Label it "satellite estimate".

## 3. Feature-to-data mapping

| Feature | Data | Class shown to the user |
|---|---|---|
| Field colour (green/yellow/red) | SMAP L4 root-zone percentile vs 2015+ climatology | Modelled (assimilates SMAP measurements) |
| Days since rain | GPM IMERG Late daily, threshold 1 mm | Satellite estimate |
| Soil health score 0-100 | SoilGrids pH, SOC, CEC, texture against documented target ranges | Derived |
| Nitrogen status | DüV calculation from farmer inputs, if provided; else "not available" | Derived or unavailable |
| Weather + 3-day forecast | Open-Meteo, DWD | Model forecast / official warning |
| Vegetation trend, 3 years | Sentinel-2 NDVI per clear scene, field mean; linear trend of peak-season NDVI | Observed + derived trend |
| Yield (productivity) zones | Peak-season NDVI image per year, per-pixel normalised, averaged, split into thirds; stability = share of pixels in the same class in at least 2 of 3 years | Derived |
| Erosion risk | DEM slope, SoilGrids silt/sand, bare-soil months from NDVI | Derived |
| Leaching risk + alert | SoilGrids sand/CEC, IMERG past rain, Open-Meteo forecast rain, fertiliser date from the farmer | Derived |
| Soil moisture trend, 30 days | SMAP L3 (measured, dots) + SMAP L4 root zone (modelled, line) | Measured vs modelled, drawn differently |
| In-field moisture gradient overlay | Sentinel-2 NDMI, latest clear scene | Observed index of plant water, not soil moisture |
| Leaching / nitrogen risk overlay | SoilGrids pixels clipped to field (250 m, so few cells per field) | Derived, coarse |
| Action cards | Rules over the above, each citing its inputs | Derived |

## 4. Current codebase findings

- `field_analytics/` already has real Sentinel-2 reading (`s2_raster.py`), productivity zones, soil brightness, elevation, correlation and report services, and frontend tabs (Status, Field report, Data catalog, Prescription maps, Yield analysis).
- Still synthetic and must be removed for the demo: `sentinel_service.synthesize_field_observation` (seeded random NDVI) is called as a fallback in `report_service.py` and `sentinel_service.compute_observation`; `generate_canonical_scenes` invents scenes; `nasa/smap/client.fetch_open_smap_daily` (POWER GWETTOP × 0.42 labelled as SMAP); `nasa/gpm/client.fetch_open_gpm_daily` (POWER PRECTOTCORR labelled as IMERG); `nasa/modis/client.py` (sine-wave NDVI); `field_segmentation/satellite_service.py` simulated reflectance.
- No synthetic data in the weather module (removed earlier).

## 5. Architecture

- Backend: new `nasa/appeears_client.py` (submit, poll, download, cache per field) and `nasa/gpm/imerg_opendap.py` (point subset per day, cached). Both store rows with real granule IDs and a `provenance` of `measured` / `modelled` / `satellite_estimate`.
- New service `field_analytics/field_health_service.py` composing trend, zones, erosion, leaching and action cards from existing services. New endpoints under `/api/field-analytics/{field_id}/health` and `/api/field-map/summary`.
- Frontend: Field Map uses the existing Leaflet map; field card and overlays as separate components; Field Health Trend as a new tab in `FieldAnalyticsWorkspace`. Every value carries its source and class.
- Caching: AppEEARS results per field per day in SQLite; IMERG day cells cached; NDVI observations already cached in `field_satellite_observations`.

## 6. Demo-day risks

- AppEEARS tasks queue for minutes to an hour. Data for the demo fields must be fetched tonight and served from cache.
- Sentinel-2 reads go over HTTP to AWS. Three years of scenes for a field can take several minutes the first time; pre-compute tonight.
