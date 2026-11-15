"""
Real NASA Earthdata access (no modelled stand-ins).

- SMAP L3 Enhanced (measured surface soil moisture), SMAP L4 (modelled root zone),
  MODIS MOD13Q1 NDVI and ECOSTRESS ESI come from NASA AppEEARS, which extracts
  values for a point or a field polygon so global granules are never downloaded.
- GPM IMERG Late daily precipitation comes from NASA's cloud OPeNDAP service as a
  one-cell subset per day.

Every stored value keeps its product, variable, quality information and the
AppEEARS task or granule it came from.
"""
