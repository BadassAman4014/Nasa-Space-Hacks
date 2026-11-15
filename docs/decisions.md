# Decision Log

Important technical decisions for FieldShift, with the short reason for each. Newest at the bottom of each section.

## Data integrity

| # | Decision | Reason |
|---|---|---|
| D1 | No random, seeded, hard-coded or placeholder values anywhere a farmer reads data. If a source fails, the UI says so. | A demo or decision based on invented numbers is worse than an honest "unavailable". |
| D2 | Every value carries a provenance label: measured, observed, satellite estimate, modelled, derived, farmer input, unavailable. | Farmers and judges must be able to tell a satellite measurement from a model or our own rule. |
| D3 | Removed the synthetic Sentinel-2 path (`generate_canonical_scenes`, `synthesize_field_observation`, the "heal" step in `report_service`). Unreadable or cloudy scenes are dropped. | They produced fake scene IDs and seeded-random NDVI that looked real. |
| D4 | Replaced the "SMAP" client (NASA POWER GWETTOP × 0.42), the "GPM" client (NASA POWER PRECTOTCORR) and the MODIS client (sine wave) with real NASA products. | They were labelled as NASA missions but were model fields or a formula. |
| D5 | SMAP L3 retrievals are used only when the quality flag says "recommended" and the value is 0.02-0.60 m³/m³. | Raw L3 contains implausible values, e.g. 0.52 m³/m³ on 2 Oct 2026 for a sandy loam. |

## Data access

| # | Decision | Reason |
|---|---|---|
| D6 | SMAP L3E, SMAP L4 and MODIS MOD13Q1 via NASA AppEEARS point extraction. | One SMAP global granule is ~658 MB; AppEEARS returns only the value at the field (a few KB). |
| D7 | GPM via IMERG **Late** daily (GPM_3IMERGDL.07), not Final. | Final stops at 30 Sep 2025; Late is current to yesterday. Labelled "satellite estimate, not gauge-corrected". |
| D8 | IMERG read as a one-cell subset from NASA cloud OPeNDAP, 8 parallel requests, cached per cell and day. | 32 MB per global file vs a few KB; 400 days load in about a minute the first time, then instantly. |
| D9 | Earthdata token sent as a Bearer header, never in URLs or logs. | Keeps the credential out of server logs and browser history. |
| D10 | AppEEARS is asynchronous: tasks are queued, a background worker polls every 60 s, and the app serves the cache. A pre-fetch script fills the cache before a demo. | AppEEARS takes minutes to an hour; a page request must never wait on it. |
| D11 | Do not resubmit an AppEEARS task if one finished in the last 24 h, even when the newest days are missing. | SMAP L4 publishes with a ~3-day lag; otherwise every page load would queue a new job. |
| D12 | Sentinel-2 from Element84 Earth Search (public COGs), reading only the field window; 6 scenes in parallel; history limited to the last 3 years plus the current one. | One scene took 14.5 s sequentially; 3 years for a field now takes 1.5-9 min once, then it is cached. |
| D13 | Real data for all NASA pages is stored in `backend/app/data/nasa_real_data.db` with the AppEEARS task or granule ID per value. | Each number can be traced to its source request. |

## Analytics rules

| # | Decision | Reason |
|---|---|---|
| D14 | Field colour (green/yellow/red) uses the SMAP L4 root-zone **percentile** vs climatology: < 20 red, 20-40 yellow, >= 40 green. | Avoids inventing absolute m³/m³ thresholds that depend on soil; 20th percentile matches the US Drought Monitor D1 boundary. |
| D15 | Moisture shown as "around the field", with the 9 km cell size stated. | SMAP cells are larger than any field; they cannot show differences inside it. |
| D16 | In-field moisture overlay: ECOSTRESS ESI (70 m) when a recent cloud-free overpass covers >= 60 % of the field; otherwise Sentinel-2 NDMI (20 m). Both labelled as plant/evaporative water status, not soil moisture. | Only these resolve differences inside a 6-19 ha field. SMAP/Sentinel-1 (3 km) has no data since June 2026; GLDAS is 25 km and ends July 2026. |
| D17 | Nitrogen overlay = Sentinel-2 red-edge NDRE, split into thirds within the field, shown only when mean NDVI >= 0.4. | NDRE tracks chlorophyll/N uptake only in a growing canopy; on bare soil it would be meaningless. |
| D18 | Nitrogen number = an estimate following DüV § 4 / Anlage 4 (requirement value, yield correction, Nmin, humus > 4.5 %, previous crop, 10 % of last year's organic N), from farmer inputs. Shown as "not available" without crop, yield target and Nmin. | No public API gives the legal N ceiling; the DüV calculation needs farm data. Values must be checked against BESyD / the official Düngebedarfsermittlung. |
| D19 | Red-zone status is not used; the UI says the 20 % reduction would apply in a red zone. | FieldShift has no verified red-zone layer yet. |
| D20 | Soil health score 0-100 = equal-weight mean of pH, organic carbon, CEC and bulk density scores from SoilGrids, with the rule per component shown. Labelled "FieldShift indicator, not an official index". | Transparent and reproducible; no official German index exists for this. |
| D21 | Vegetation trend = linear slope of each season's highest April-July field-mean NDVI; |slope| <= 0.02/year = stable. | Peak-season NDVI is comparable year to year; single scenes are dominated by crop stage and clouds. |
| D22 | Yield zones reuse the existing `productivity_service` (per-season relative NDVI rank, averaged, split into thirds) with at least 2 seasons. | It already works on real NDVI grids; OneSoil uses the same idea with up to 9 seasons. |
| D23 | Yield-zone image placed on the map using the WGS84 bounding box of its UTM grid. | Simple and stable; the rotation error at this longitude is under 1°, invisible at field scale. |
| D24 | Erosion risk = points for slope (DEM), silt or sand share and organic carbon (SoilGrids), heavy-rain days (IMERG), bare-soil share (Sentinel-2); separate water and wind totals; 0-1 green, 2 yellow, >= 3 red. Labelled as a screening rule, not DIN 19708. | Brandenburg's sandy soils make wind erosion the main risk; every point is traceable to a source. |
| D25 | Leaching alert when >= 20 mm rain falls or is forecast within 14 days after an N application on medium/high-vulnerability soil (sand >= 50 % or low CEC). | Heavy rain shortly after N on sand is the classic leaching case; thresholds are stated in the UI. |
| D26 | Seeding window (cover crop) open when the 72 h forecast 0-7 cm soil temperature averages >= 8 °C and forecast rain < 20 mm. | Uses only forecast data we have; stated as a rule so it can be tuned. |
| D27 | DüV blocking-period reminder from 1 October to 31 January. | Mid-November advice must not suggest applying nitrogen on arable land. |
| D28 | Action cards only come from rules over the analytics above, and each card lists its evidence. | Requirement: recommendations based on evidence, not generic tips. |

## UI and integration

| # | Decision | Reason |
|---|---|---|
| D29 | Field Map and Field Health are new tabs inside the existing Field Analytics workspace; Field Map is the default tab. | Reuses the existing page, header, field switcher and design system. |
| D30 | Charts are small hand-written SVG components, no new chart library. | The existing tabs already use SVG; avoids a new dependency the night before a demo. |
| D31 | Leaching overlay colours the whole field instead of zones. | SoilGrids is 250 m, so a 12 ha field covers about two cells; zones would be fake precision. |
| D32 | Field card links: Field Health (tab), Crop Planner (Rotation Studio page), Documentation (Reports & Evidence page). | Those are the existing pages for planning and compliance documentation. |
| D33 | Map zoom control moved to the bottom right. | It overlapped the overlay panel and blocked its checkboxes. |

## Reference research

| # | Decision | Reason |
|---|---|---|
| D34 | OneSoil was explored only through the user's own signed-in browser session; no login bypass, no credentials handled. | Their report requires an account. |
| D35 | US-only datasets from the NASA resource list (SSURGO, WSS, CDL, PRISM, NAIP, NLCD, CoCoRaHS, NWIS, OpenET, LANDFIRE, QuickStats, AMS) are not used. | They have no data for Germany; SoilGrids, DFBK and DWD fill those roles. |

## Found while testing

| # | Decision | Reason |
|---|---|---|
| D36 | Field 1's SMAP L4 values were loaded from the earlier probe request (NASA task 36999496), but only because the probe point sits in the same 9 km EASE-Grid cell (2081, 172). Field 2 is in cell (2080, 172) and gets no borrowed data. | A 9 km cell value is valid for any field inside it; I checked the cell index against the one NASA returned. The stop-gap has no percentile layer, so the field colour stays "unavailable" until its own request finishes. |
| D37 | Retrievals with no quality flag are labelled "no quality flag" and are not drawn as measured dots. | The probe request did not include the flag layer; without it the "recommended quality" test cannot be applied. |
| D38 | Map containers use `isolate` (own stacking context). | Leaflet panes (z-index 400+) covered the header's field-switcher dropdown, so another field could not be selected from the Field Map tab. Found by the browser test. |
| D39 | Existing `test_field_analytics.py` NDVI tests now read real scenes (minutes) instead of synthetic ones (milliseconds). | Expected consequence of removing the fake data; run them in the background. |

| D40 | The field colour and the 30-day moisture trend read SMAP L4 straight from NASA cloud OPeNDAP (one 9 km cell per day), not through the AppEEARS queue. | AppEEARS had a 1.5 h+ queue. OPeNDAP returns the same numbers (checked: 0.07650877 vs AppEEARS 0.0765088) in about a second per day. |
| D41 | The percentile is computed by us: today's root-zone value ranked against the same cell's 10:30 UTC values within +-15 days of this date, 2016 to last year (310 samples). | NASA's own `sm_rootzone_pctl` layer is mostly fill values and is empty at the Cottbus cell on every date tested, so the rule would never have fired. |
| D42 | Both fields currently show "low moisture": 0.074 m³/m³ against an autumn median of 0.132 and a lowest year-mean of 0.113 (2018). | Real result, consistent with 19 days since rain and 1.1 mm in 7 days from IMERG. |
| D43 | Still queued at NASA AppEEARS and only needed for extras: SMAP L3 quality-flagged dots, MODIS NDVI, and the ECOSTRESS overlay (area request). | The demo does not depend on them; the cards show "unavailable" with the reason until they arrive. |

## Known gaps (not done)

- `field_segmentation/satellite_service.py` (AI field detection) still has a simulated-reflectance fallback. It is outside Field Analytics and was not changed.
- The Status tab's precipitation and GDD charts still use NASA POWER (correctly labelled as NASA POWER, a model product).
- No verified Brandenburg red-zone layer.
