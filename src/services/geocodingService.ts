import type { SavedField, UserFarm } from './boundariesApi';

export type SearchResultCategory = 'field' | 'farm' | 'location' | 'coordinates';

export interface SearchResult {
  id: string;
  category: SearchResultCategory;
  title: string;
  subtitle: string;
  badge: string;
  lat?: number;
  lon?: number;
  bounds?: [[number, number], [number, number]]; // [[south, west], [north, east]]
  fieldId?: string;
  farmId?: string;
  fieldData?: SavedField;
  farmData?: UserFarm;
  inBrandenburg?: boolean;
}

// Bounding box for state of Brandenburg, Germany
export const BRANDENBURG_BBOX = {
  west: 11.2,
  south: 51.3,
  east: 14.8,
  north: 53.6,
};

export function isWithinBrandenburg(lat: number, lon: number): boolean {
  return (
    lat >= BRANDENBURG_BBOX.south &&
    lat <= BRANDENBURG_BBOX.north &&
    lon >= BRANDENBURG_BBOX.west &&
    lon <= BRANDENBURG_BBOX.east
  );
}

// Comprehensive built-in catalog of Brandenburg cities, municipalities, villages and agricultural regions
export const BRANDENBURG_LOCATIONS: {
  name: string;
  type: 'city' | 'municipality' | 'village' | 'region';
  lat: number;
  lon: number;
  description: string;
}[] = [
  { name: 'Potsdam', type: 'city', lat: 52.3989, lon: 13.0657, description: 'State Capital · Central Brandenburg' },
  { name: 'Cottbus', type: 'city', lat: 51.7563, lon: 14.3329, description: 'City · Southern Brandenburg (Lausitz)' },
  { name: 'Brandenburg an der Havel', type: 'city', lat: 52.4111, lon: 12.5561, description: 'City · Western Brandenburg' },
  { name: 'Frankfurt (Oder)', type: 'city', lat: 52.3424, lon: 14.5516, description: 'City · Eastern Border Region' },
  { name: 'Havelland', type: 'region', lat: 52.6375, lon: 12.6961, description: 'Agricultural Region · Rich Loam & Alluvial Soils' },
  { name: 'Oderbruch', type: 'region', lat: 52.7118, lon: 14.2882, description: 'Polder Agricultural Region · Fertile Basin' },
  { name: 'Spreewald', type: 'region', lat: 51.8694, lon: 13.9589, description: 'Biosphere Reserve & Vegetable Cultivation Region' },
  { name: 'Barnim', type: 'region', lat: 52.8344, lon: 13.6875, description: 'Plateau Region · North-East Brandenburg' },
  { name: 'Fläming', type: 'region', lat: 52.05, lon: 12.8, description: 'Upland Agricultural Region · South-West' },
  { name: 'Uckermark', type: 'region', lat: 53.25, lon: 13.9, description: 'Northern Agricultural Region · Arable Plains' },
  { name: 'Nauen', type: 'municipality', lat: 52.6053, lon: 12.8753, description: 'Municipality · Havelland Arable Basin' },
  { name: 'Neuruppin', type: 'municipality', lat: 52.9244, lon: 12.8058, description: 'Town · Ostprignitz-Ruppin' },
  { name: 'Eberswalde', type: 'municipality', lat: 52.8344, lon: 13.8197, description: 'Town · Barnim' },
  { name: 'Jüterbog', type: 'municipality', lat: 51.9922, lon: 13.0808, description: 'Town · Teltow-Fläming Grain Region' },
  { name: 'Luckenwalde', type: 'municipality', lat: 52.0897, lon: 13.1706, description: 'Town · Teltow-Fläming' },
  { name: 'Kyritz', type: 'municipality', lat: 52.9436, lon: 12.3961, description: 'Town · Ostprignitz-Ruppin Farming Region' },
  { name: 'Wittstock/Dosse', type: 'municipality', lat: 53.1633, lon: 12.4858, description: 'Town · Northern Brandenburg' },
  { name: 'Prenzlau', type: 'municipality', lat: 53.315, lon: 13.8631, description: 'Town · Uckermark Breadbasket' },
  { name: 'Angermünde', type: 'municipality', lat: 53.0175, lon: 13.9989, description: 'Town · Uckermark' },
  { name: 'Beeskow', type: 'municipality', lat: 52.1722, lon: 14.2464, description: 'Town · Oder-Spree Farming Region' },
  { name: 'Seelow', type: 'municipality', lat: 52.5333, lon: 14.3833, description: 'Town · Gateway to the Oderbruch' },
  { name: 'Rathenow', type: 'municipality', lat: 52.6067, lon: 12.3392, description: 'Town · Havelland' },
  { name: 'Werder (Havel)', type: 'municipality', lat: 52.3803, lon: 12.9347, description: 'Town · Fruit & Horticulture Region' },
  { name: 'Königs Wusterhausen', type: 'municipality', lat: 52.2981, lon: 13.6267, description: 'Town · Dahme-Spreewald' },
  { name: 'Lübbenau/Spreewald', type: 'municipality', lat: 51.8681, lon: 13.9686, description: 'Town · Spreewald' },
  { name: 'Treuenbrietzen', type: 'village', lat: 52.0967, lon: 12.8711, description: 'Municipality · Potsdam-Mittelmark Farmlands' },
  { name: 'Großbeeren', type: 'village', lat: 52.3556, lon: 13.3083, description: 'Municipality · Horticultural Research Center' },
  { name: 'Golzow', type: 'village', lat: 52.5744, lon: 14.4925, description: 'Village · Oderbruch Agricultural Community' },
  { name: 'Paaren im Glien', type: 'village', lat: 52.6517, lon: 12.9739, description: 'Village · Brandenburg Agricultural Exhibition Center' },
  { name: 'Ribbeck', type: 'village', lat: 52.6261, lon: 12.7533, description: 'Village · Havelland Farmland' },
];

// External reference agricultural regions for testing AI boundary detection outside Brandenburg
export const EXTERNAL_AGRICULTURAL_REGIONS: {
  name: string;
  type: 'city' | 'municipality' | 'village' | 'region';
  lat: number;
  lon: number;
  description: string;
}[] = [
  {
    name: 'Umred, Maharashtra',
    type: 'region',
    lat: 20.854,
    lon: 79.326,
    description: 'Cotton & Soybean Vertisol Region · Nagpur District, India',
  },
  {
    name: 'Nagpur Agricultural Belt',
    type: 'region',
    lat: 21.1458,
    lon: 79.0882,
    description: 'Central India Agriculture · Vidarbha Region',
  },
];

/**
 * Computes bounding box [[south, west], [north, east]] for a GeoJSON geometry.
 */
export function calculateGeometryBounds(geometry: any): [[number, number], [number, number]] | null {
  if (!geometry || !geometry.coordinates) return null;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;

  function traverse(coords: any) {
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      const lon = coords[0];
      const lat = coords[1];
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
    } else if (Array.isArray(coords)) {
      for (const item of coords) {
        traverse(item);
      }
    }
  }

  traverse(geometry.coordinates);

  if (minLat === Infinity) return null;
  return [
    [minLat, minLon],
    [maxLat, maxLon],
  ];
}

/**
 * Computes centroid [lat, lon] for a GeoJSON geometry.
 */
export function calculateGeometryCentroid(geometry: any): [number, number] | null {
  const bounds = calculateGeometryBounds(geometry);
  if (!bounds) return null;
  const lat = (bounds[0][0] + bounds[1][0]) / 2;
  const lon = (bounds[0][1] + bounds[1][1]) / 2;
  return [lat, lon];
}

/**
 * Tests if input string represents geographic coordinates (lat, lon).
 */
export function parseCoordinates(query: string): { lat: number; lon: number } | null {
  const cleaned = query.trim().replace(/[°NSEWnsew,;]/g, ' ');
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const lat = parseFloat(parts[0]);
    const lon = parseFloat(parts[1]);
    if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      return { lat, lon };
    }
  }
  return null;
}

/**
 * Unified geocoding & search service with context-specific ranking.
 */
export async function executeUnifiedSearch(
  query: string,
  options: {
    mode: 'dashboard' | 'explorer';
    savedFields?: SavedField[];
    savedFarms?: UserFarm[];
  }
): Promise<SearchResult[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const fields = options.savedFields || [];
  const farms = options.savedFarms || [];

  // Check coordinates first
  const parsedCoords = parseCoordinates(q);
  const coordResults: SearchResult[] = [];
  if (parsedCoords) {
    const inBB = isWithinBrandenburg(parsedCoords.lat, parsedCoords.lon);
    coordResults.push({
      id: `coord-${parsedCoords.lat}-${parsedCoords.lon}`,
      category: 'coordinates',
      title: `${parsedCoords.lat.toFixed(5)}, ${parsedCoords.lon.toFixed(5)}`,
      subtitle: inBB ? 'Coordinates inside Brandenburg (DFBK supported)' : 'Coordinates outside Brandenburg',
      badge: 'Coordinates',
      lat: parsedCoords.lat,
      lon: parsedCoords.lon,
      inBrandenburg: inBB,
    });
  }

  // 1. Saved Fields search (matches name, source ID, category, current crop)
  const fieldResults: SearchResult[] = [];
  for (const f of fields) {
    const nameMatch = f.name.toLowerCase().includes(q);
    const idMatch = f.id.toLowerCase().includes(q) || (f.source_boundary_id && f.source_boundary_id.toLowerCase().includes(q));
    const cropMatch = f.current_crop && f.current_crop.toLowerCase().includes(q);
    const farmMatch = f.farm_name && f.farm_name.toLowerCase().includes(q);

    if (nameMatch || idMatch || cropMatch || farmMatch) {
      const bounds = calculateGeometryBounds(f.geometry);
      const centroid = calculateGeometryCentroid(f.geometry);
      fieldResults.push({
        id: `field-${f.id}`,
        category: 'field',
        title: f.name,
        subtitle: `${f.farm_name || 'Farm'} · ${f.area_hectares.toFixed(1)} ha · ${f.current_crop || 'No crop'} (${f.source_boundary_id || 'User field'})`,
        badge: 'Saved Field',
        lat: centroid ? centroid[0] : undefined,
        lon: centroid ? centroid[1] : undefined,
        bounds: bounds || undefined,
        fieldId: f.id,
        fieldData: f,
        inBrandenburg: true,
      });
    }
  }

  // 2. Saved Farms search
  const farmResults: SearchResult[] = [];
  for (const farm of farms) {
    if (farm.name.toLowerCase().includes(q) || farm.location.toLowerCase().includes(q)) {
      // Find all fields for this farm to calculate collective bounds
      const farmFields = fields.filter((f) => f.farm_id === farm.id);
      let farmBounds: [[number, number], [number, number]] | undefined;

      if (farmFields.length > 0) {
        let minLat = Infinity;
        let maxLat = -Infinity;
        let minLon = Infinity;
        let maxLon = -Infinity;
        for (const ff of farmFields) {
          const b = calculateGeometryBounds(ff.geometry);
          if (b) {
            if (b[0][0] < minLat) minLat = b[0][0];
            if (b[1][0] > maxLat) maxLat = b[1][0];
            if (b[0][1] < minLon) minLon = b[0][1];
            if (b[1][1] > maxLon) maxLon = b[1][1];
          }
        }
        if (minLat !== Infinity) {
          farmBounds = [[minLat, minLon], [maxLat, maxLon]];
        }
      }

      farmResults.push({
        id: `farm-${farm.id}`,
        category: 'farm',
        title: farm.name,
        subtitle: `${farm.location} · ${farmFields.length} saved field(s)`,
        badge: 'Farm',
        farmId: farm.id,
        farmData: farm,
        bounds: farmBounds,
        inBrandenburg: true,
      });
    }
  }

  // 3. Geographic Locations search (Local dictionary + External agricultural regions)
  const locationResults: SearchResult[] = [];
  const allLocations = [...BRANDENBURG_LOCATIONS, ...EXTERNAL_AGRICULTURAL_REGIONS];
  for (const loc of allLocations) {
    if (loc.name.toLowerCase().includes(q) || loc.description.toLowerCase().includes(q)) {
      const isBrandenburg = isWithinBrandenburg(loc.lat, loc.lon);
      const badge =
        !isBrandenburg
          ? 'External Region'
          : loc.type === 'city'
          ? 'City'
          : loc.type === 'region'
          ? 'Region'
          : loc.type === 'village'
          ? 'Village'
          : 'Municipality';

      locationResults.push({
        id: `loc-${loc.name}`,
        category: 'location',
        title: loc.name,
        subtitle: loc.description,
        badge,
        lat: loc.lat,
        lon: loc.lon,
        inBrandenburg: isBrandenburg,
      });
    }
  }

  // 4. Remote lookup for German postal codes (e.g. 03046) and places missing from the local catalog.
  const hasPostcode = /(^|\s)\d{5}(\s|$)/.test(q);
  if (!parsedCoords && (hasPostcode || (locationResults.length === 0 && q.length >= 4))) {
    try {
      const res = await fetch(`/api/boundaries/geocode?q=${encodeURIComponent(query.trim())}`);
      if (res.ok) {
        const places: { title: string; display_name: string; lat: number; lon: number; bounds?: [[number, number], [number, number]] | null }[] =
          await res.json();
        for (const p of places) {
          const inBB = isWithinBrandenburg(p.lat, p.lon);
          locationResults.push({
            id: `geo-${p.lat}-${p.lon}`,
            category: 'location',
            title: p.title,
            subtitle: p.display_name,
            badge: inBB ? 'Address' : 'Outside Brandenburg',
            lat: p.lat,
            lon: p.lon,
            bounds: p.bounds || undefined,
            inBrandenburg: inBB,
          });
        }
      }
    } catch {
      // Remote lookup is optional; the local catalog results still apply.
    }
  }

  // Ranking logic based on page context:
  if (options.mode === 'dashboard') {
    // Dashboard Priority:
    // 1. Saved field names & IDs
    // 2. Farm names
    // 3. Coordinates
    // 4. Geographic locations
    return [...fieldResults, ...farmResults, ...coordResults, ...locationResults];
  } else {
    // Field Explorer Priority:
    // 1. Coordinates
    // 2. Cities, municipalities, regions, villages
    // 3. Saved fields & farms (secondary)
    return [...coordResults, ...locationResults, ...fieldResults, ...farmResults];
  }
}

/**
 * Reverse-geocodes latitude & longitude into a human-readable city/region name.
 * Uses Nominatim with fallback to the local Brandenburg catalog.
 */
export async function reverseGeocodeLocation(lat: number, lon: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=12&addressdetails=1`,
      { headers: { 'Accept-Language': 'en,de' } }
    );
    if (res.ok) {
      const data = await res.json();
      const addr = data.address || {};
      const locality =
        addr.city ||
        addr.town ||
        addr.village ||
        addr.municipality ||
        addr.suburb ||
        addr.county ||
        addr.hamlet;
      const stateOrCountry = addr.state || addr.country;
      if (locality && stateOrCountry) {
        return `${locality}, ${stateOrCountry}`;
      }
      if (locality) return locality;
      if (data.display_name) {
        return data.display_name.split(',').slice(0, 2).join(',').trim();
      }
    }
  } catch {
    // Ignore and fallback
  }

  // Fallback: Find closest known region in catalog
  let closestName = '';
  let minDistance = Infinity;
  for (const loc of BRANDENBURG_LOCATIONS) {
    const d = Math.hypot(loc.lat - lat, loc.lon - lon);
    if (d < minDistance) {
      minDistance = d;
      closestName = `${loc.name}, Brandenburg`;
    }
  }
  if (minDistance < 0.8) {
    return closestName;
  }

  return `${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E`;
}

