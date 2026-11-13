# FieldShift dashboard redesign: instructions for the coding AI

*Paste this whole document into your AI. It was written against your actual `src.zip` (Vite + React 18 + TypeScript + react-leaflet + lucide-react, hand-written CSS in `src/index.css`). Target = the reference screenshot (dark-accent, light-gray, map-first dashboard). Current = the existing screenshot.*

---

## 0. Ground rules

1. **Scope:** restyle and restructure the UI only. Do **not** touch `src/services/*`, `src/types/*`, `backend/*`, `package.json` dependencies (use only `react`, `react-leaflet`, `leaflet`, `lucide-react`). No new libraries.
2. **Do not append CSS overrides.** `src/index.css` is one minified blob that already contains three layers of overrides (base rules, a `/* Compact field operations layout */` block at `min-width:851px`, and a Leaflet block). Stacking a fourth layer is why the UI feels naive and inconsistent. Instead: delete the obsolete rules listed in section 3 and write clean, readable, multi-line CSS in new files (`src/styles/tokens.css`, `src/styles/shell.css`, `src/styles/dashboard.css`), imported from `main.tsx` after `index.css`.
3. **Split `src/App.tsx`.** The dashboard pieces (`Sidebar`, `Dashboard`, `Suitability`, `SoilChart`, `Weather`, `MapView`) move to `src/components/dashboard/*.tsx` and `src/components/shell/Sidebar.tsx`. Other pages stay in `App.tsx` unchanged except for class-name/token updates in section 7.
4. **Typography floor:** no text below **11px** anywhere (the current UI uses 8, 9 and 10px in many places). Use `font-variant-numeric: tabular-nums` on all numbers.
5. **Keep the "demo data" honesty.** Do not copy the reference's sample content ("Stanfield Land", "Texas", "Sahara Group", "Rice Field"). Keep this app's content (Greenfield Farm, Potsdam, Brandenburg, winter wheat) and keep a small `DEMO DATA` badge in the property card.
6. **Done = all pass:** `npm run typecheck`, `npm run lint`, `npm run build`, no console errors, and the acceptance checklist in section 10.

Work in this order: tokens → shell → left panel → map → other pages → responsive → data fixes.

---

## 1. What is wrong today (diagnosis)

| Area | Current | Target (reference) |
| --- | --- | --- |
| App shell | 70px **dark green** icon sidebar + 56px **white top bar** with Back / farm select / search / Export / bell / avatar | **Light gray** 64px icon rail, **no top bar** on the dashboard. Search, "New Crop", Export and bell **float over the map** |
| Left panel | White bordered cards (1px border, 13px radius) on near-white; tiny 9–11px text; looks like a form | Panel background is **gray**; cards are **borderless, off-white, 22px radius**, 10px gaps, larger type hierarchy |
| Panel header | None | Row of pills: **Back**, **● 3 Field active**, kebab button |
| Property info | "Environmental snapshot" heading only | **Property card**: name + map icon, area right-aligned, location line, green ROI/yield line |
| Metrics | 4 small cells with trend text | 2×2 grid of **big numbers** (32px) with a **Max / Min** mini-column on each cell, hairline dividers |
| Suitability | Score 82/100 + ring + progress bar | **Segmented tick gauge** red→green with a dark marker, "Good for planting" label, and an **AI Insights pill** |
| Soil chart | Smooth green line, y-axis 0–60 | **Stepped, color-coded segments** (red/amber/green by level), soft area fill, **highlighted column + dark "90% Water" tooltip** |
| Weather | 5 text columns | Big temp + condition + "Conditions" dropdown, **icon strip**, **orange area chart** with dashed "now" line |
| Map fields | Thin orange outlines at zoom 12; fields sit on lakes and forest (Havel lakes SW of Potsdam), look like terrain blobs | Fields on real **cropland**, zoomed to the selected field. Selected field = **vivid green gradient fill + dotted sensor grid + white outline + label with signal icon and "Active Monitoring"**. Others = orange tint |
| Field popup | Always-open small card, same data for every field, tiny type | **Floating white card** with close ✕, star, dates, health bar, collapsible **Sensor Read** / **Sensor log**, dark **AI Insights** block. Data changes per field |
| Map controls | Layers panel bottom-left, fake zoom buttons, static fake minimap, "2D" badge | Right-bottom **dark control stack** (fullscreen, zoom +/−, locate, 2D), real **minimap** with viewport rectangle, **scale bar** bottom-left |
| Visual language | Green everywhere, borders, shadows, Manrope 800 headings | Neutral gray/white/near-black UI; **orange is the only CTA color**; green is only for positive status |

---

## 2. Design tokens

Create `src/styles/tokens.css` and replace the Google Fonts import in `index.css` with **Inter** (weights 400, 500, 600). Replace every `font-family: Manrope…` and `'DM Sans'` with `var(--font)`; no font-weight above 600.

```css
:root {
  --font: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;

  --bg-panel: #E8E8E8;   /* rail + left panel + page background */
  --bg-card:  #F8F8F8;   /* cards on the panel */
  --bg-chip:  #FFFFFF;   /* pills, buttons, floating map cards */
  --bg-inset: #F1F1F1;   /* inset rows inside white cards */
  --ink:   #1B1B1B;
  --ink-2: #6F6F6F;
  --ink-3: #9A9A9A;
  --line:  #E3E3E3;
  --dark:  #262626;      /* map buttons, tooltips, AI insight block */

  --green:  #1FA35B;  --green-soft: #E3F5EA;
  --orange: #FF7A1A;  /* the one CTA color */
  --amber:  #F5A524;  --red: #E5483D;  --blue: #4A8FCC;

  --r-card: 22px;  --r-ctl: 12px;
  --gap: 10px;
  --rail-w: 64px;
  --panel-w: clamp(400px, 33vw, 560px);
  --shadow-float: 0 8px 28px rgba(0, 0, 0, .18);   /* ONLY for cards floating over the map */
}
body { font-family: var(--font); color: var(--ink); background: var(--bg-panel); }
```

**Type scale (1440px viewport):** section title 16/600 · card title 18/600 · label 13/400 `--ink-2` · big metric 32/500, letter-spacing −0.02em, unit at 60% size · body 13/400 · small 12/400 · minimum 11.

**Rules:** cards have **no border and no shadow**. Radius 22px for cards, 12px for buttons/pills/inputs. Icons are lucide, 20px, `strokeWidth={1.75}`.

---

## 3. CSS to delete from `index.css` before writing new CSS

Remove these rule families (and every `@media` rule that only targets them), then rewrite them in the new files: `.sidebar`, `.brand*`, `.nav-*`, `.new-pill`, `.sidebar-*`, `.region`, `.user-card`, `.topbar` *(keep a restyled version for non-map pages, see section 7)*, `.top-search`, `.shortcut`, `.dashboard-grid`, `.dashboard-sidebar`, `.metrics-grid`, `.metric*`, `.suitability*`, `.score-*`, `.status-badge`, `.muted-note`, `.chart*`, `.grid-lines`, `.weather-card`, `.current-weather`, `.condition-chip`, `.forecast-row`, `.map-*`, `.field-*`, `.selected-tag`, `.layer*`, `.toggle`, `.ai-insight`, `.sensor-readings`, `.demo-ribbon`, `.real-map-view`, `.leaflet-*` overrides, and the whole `/* Compact field operations layout */` block.

---

## 4. Shell and layout

### 4.1 `App.tsx`

- Add `const isMapPage = page === 'dashboard';`
- Render `<Topbar …/>` **only when `!isMapPage`**.
- Wrap content as `<div className={`page-content ${isMapPage ? 'page-content--bleed' : ''}`}>`.
- In `Dashboard`, **remove `<PageTitle …/>`** (no "Good morning, Jonas" heading on this screen).
- Add a floating hamburger (`.map-menu-btn`, visible only ≤850px) inside the map that calls `setMobileNav(true)`, because the top bar is gone.

### 4.2 `src/styles/shell.css`

```css
.app-shell { display: grid; grid-template-columns: var(--rail-w) 1fr; height: 100dvh; background: var(--bg-panel); }
.workspace { min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: auto; }
.page-content--bleed { padding: 0; max-width: none; flex: 1; min-height: 0; overflow: hidden; }

/* dashboard = panel + map */
.dashboard-grid { display: grid; grid-template-columns: var(--panel-w) 1fr; height: 100%; min-height: 0; }
.dash-panel { background: var(--bg-panel); overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: var(--gap); scrollbar-width: none; }
.dash-panel::-webkit-scrollbar { display: none; }
.card-v2 { background: var(--bg-card); border-radius: var(--r-card); padding: 20px; }
.map-stage { position: relative; min-width: 0; min-height: 0; border-radius: 0; overflow: hidden; isolation: isolate; }
```

### 4.3 Sidebar becomes a light icon rail (`components/shell/Sidebar.tsx`)

- Width `var(--rail-w)`, background `var(--bg-panel)`, padding `14px 10px`, column flex, items centered.
- **Top:** logo = 36×36, radius 10, background `#1E1E1E`, white `Leaf` icon.
- **Nav items:** 44×44, radius 12, icon 20px `--ink-3`. **Active:** background `--dark`, icon white. **Hover:** `rgba(0,0,0,.06)`. Add `aria-current="page"` and `aria-label`.
- **Labels become tooltips** (the rail never shows text on desktop): on hover/focus show a dark pill to the right (`--dark`, white, 12px, radius 8, 6px 10px padding, `left: calc(100% + 10px)`). Use CSS only (`.nav-item[data-label]:hover::after { content: attr(data-label) }`).
- **Group the 7 items with 1px separators** (24px wide, `#D4D4D4`, 10px vertical margin): `[Dashboard, Field Explorer, Environmental Profile]` | `[Farmer Profile, Rotation Studio, Scenario Simulator]` | `[Reports & Evidence]`. Add a `group` number to `navItems` and render a separator when it changes.
- **Rotation Studio "NEW":** replace the text pill with a 8px orange dot at the top-right of the icon.
- **Bottom (margin-top:auto):** Settings, Help, then a 32px circular avatar `#0E5C3A` with white initials `JS`. **Delete** the "YOUR REGION" block and the user card text.
- ≤850px: keep the existing slide-in drawer behaviour, but light-themed and **with text labels visible** (`.sidebar.open .nav-item span { display: inline }`).

---

## 5. Left panel (`components/dashboard/*`)

The panel is `<div className="dash-panel">` with these children in order. All cards use `.card-v2`.

### 5.1 Header pills row

Flex row, gap 10: **Back** pill (white, radius 12, 40px high, `ChevronLeft` + "Back", navigates to `dashboard`), **"● N Field active"** pill (white; 8px green dot with a 2s soft pulse animation; N = number of fields, 3), then `margin-left:auto` a 40×40 white kebab button (`MoreVertical`).

### 5.2 Property card

- Row 1: title (18/600) = selected farm name (default **Greenfield Farm**; if `farmName === 'All Farms'` show "All farms") + a small `Map` icon button; chevron next to the title opens the **existing** farm menu (reuse `farmOpen` / `farm-menu`, restyled as a white radius-16 dropdown with `--shadow-float`). Right-aligned: area (18/600), e.g. `148 ha`.
- Row 2: `Potsdam, Brandenburg · Demo data` in `--ink-2` 13px (the demo text is a small `--bg-inset` pill). Right-aligned green line `↗ ROI 12%` (`TrendingUp` icon, `--green`, 13/500).

### 5.3 Metrics + prediction (ONE card)

**Metrics 2×2 grid**, padding 0 inside the grid, each cell `padding: 18px 20px`, **hairline dividers only between cells** (`1px var(--line)`, no outer border):

| Cell | Value | Max / Min |
| --- | --- | --- |
| Avg Humidity | 62% | 88% / 34% |
| Avg Temperature | 18.4°C | 29° / 7° |
| Avg Soil Moisture | 43 kPa | 61 kPa / 10 kPa |
| Avg pH Level | 6.4 | 7.1 / 5.8 |

(Max must always be ≥ Min; the reference mockup has this reversed for soil moisture, do not copy that.)

Cell layout: label (13px `--ink-2`) top-left, 20px gray icon top-right; below it the big value (32/500; unit in `--ink-2` at 60% size, baseline-aligned); to the right of the value a 2-row mini table `Max 80%` / `Min 10%` (label `--ink-3` 13px left, value `--ink` 13/500 right, 6px row gap, `align-self:end`). Rainfall is removed from this card (it stays in the map layers and Environmental page).

**Prediction section** (same card, top divider, padding 20px):

- Row: title "Area prediction model" (16/600) left; "Good for planting" (13px `--ink-2`) right. The text changes with the score: ≥70 "Good for planting", 40–69 "Marginal", <40 "Not recommended".
- **Gauge**, 40px high, directly below with 14px margin:

```tsx
function PredictionGauge({ score }: { score: number }) {
  const N = 60;
  return (
    <div className="gauge" role="img" aria-label={`Suitability ${score} out of 100`}>
      {Array.from({ length: N }, (_, i) => {
        const t = i / (N - 1);
        return <i key={i} style={{ background: `hsl(${4 + t * 136} 78% 54%)`, opacity: t * 100 <= score ? 1 : 0.35 }} />;
      })}
      <b className="gauge-marker" style={{ left: `${score}%` }} />
    </div>
  );
}
```

```css
.gauge { position: relative; display: flex; gap: 3px; height: 40px; }
.gauge i { flex: 1; border-radius: 2px; }
.gauge-marker { position: absolute; top: -4px; bottom: -4px; width: 3px; border-radius: 2px; background: var(--ink); transform: translateX(-50%); }
```

- Below the gauge (12px margin): a full-width `--bg-inset` rounded-12 row, 44px high: left text "12% production increase based on projection" (13/500, `Projected · demo` is fine), right a small chip `[AI] Insights` (chip: `--green-soft` background, `--green` text, 11/600 "AI" box + "Insights" in `--ink`). Delete the old score ring, progress bar and "muted-note".

### 5.4 Soil condition card

- Header: title "Soil condition" (16/600). **No y-axis labels, no subtitle.**
- Chart is a **stepped, color-coded series** with a hover/active column and a dark tooltip. Implement as one component with SVG + an absolutely positioned tooltip:

```tsx
const SOIL = [34,36,30,22,18,27,38,44,52,58,63,66,61,56,52,55,60,72,90,78,66,52,44,38,30]; // 06:00→24:00, 45-min steps (% water)
const colorFor = (v: number) => v < 25 ? 'var(--red)' : v < 40 ? 'var(--amber)' : v < 60 ? '#8FD19E' : 'var(--green)';

function SoilChart() {
  const [active, setActive] = useState(SOIL.indexOf(Math.max(...SOIL)));
  const W = 500, H = 150, step = W / SOIL.length, y = (v: number) => H - 20 - v * 1.2;
  const area = SOIL.map((v, i) => `${i ? 'L' : 'M'}${i * step} ${y(v)}L${(i + 1) * step - 4} ${y(v)}`).join('') + `L${W} ${H - 20}L0 ${H - 20}Z`;
  return (
    <section className="card-v2 soil">
      <h3>Soil condition</h3>
      <div className="soil-plot" onMouseLeave={() => setActive(SOIL.indexOf(Math.max(...SOIL)))}>
        <div className="chart-tip" style={{ left: `${((active + 0.5) / SOIL.length) * 100}%` }}><Droplets size={14} /> {SOIL[active]}% Water</div>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%">
          <defs><linearGradient id="soilArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1FA35B" stopOpacity=".18"/><stop offset="1" stopColor="#1FA35B" stopOpacity="0"/></linearGradient></defs>
          <rect x={active * step - 2} y={0} width={step} height={H - 20} fill="#1FA35B" opacity=".12" />
          <path d={area} fill="url(#soilArea)" />
          {SOIL.map((v, i) => <rect key={i} x={i * step} y={y(v) - 2} width={step - 4} height={4} rx={2} fill={colorFor(v)} onMouseEnter={() => setActive(i)} />)}
          {['06:00','09:00','12:00','15:00','18:00','21:00','24:00'].map((t, i) => <text key={t} x={(i / 6) * (W - 30)} y={H - 4} fontSize="11" fill="#9A9A9A">{t}</text>)}
        </svg>
      </div>
    </section>
  );
}
```

```css
.soil-plot { position: relative; padding-top: 44px; }
.chart-tip { position: absolute; top: 0; transform: translateX(-50%); background: var(--dark); color: #fff; font-size: 13px; font-weight: 500; padding: 8px 12px; border-radius: 10px; display: flex; gap: 6px; align-items: center; white-space: nowrap; }
.chart-tip::after { content: ''; position: absolute; left: 50%; bottom: -5px; width: 10px; height: 10px; background: var(--dark); transform: translateX(-50%) rotate(45deg); }
```

Adjust the `H - 20` / `y()` constants if labels clip, but keep: \~25 segments, 4px thick rounded, color by level, active column tint, tooltip above with a caret.

### 5.5 Weather card

- Row 1: cloud icon (36px, `--ink-3`) + temperature **"27°"** (44/500) + two-line text "Cloudy" / "Feels like 29°" (`--ink-2` 13px) · right: white pill **"Conditions ▾"** (radius 12, 40px high, blue cloud icon). Card title "Weather forecast" goes **above** this row in `--ink-3` 14px (as in the reference, it is muted).
- Row 2 (16px below): **10 evenly spaced weather icons** (18px; cloud / sun-cloud / rain mix, stored in a `HOURLY` array of `{ t: '14:00', temp: 27, icon: 'cloud' | 'sun' | 'rain' }`), time labels beneath in 11px `--ink-3`.
- Row 3: **orange area chart**, 120px high: stroke `--amber` 2px (dashed `5 4`), area fill gradient `--amber` .45 → 0, light vertical grid lines every \~15%, y-labels `32°` and `30°` on the right (11px `--ink-3`), and a **dashed vertical "now" line** (`stroke #1B1B1B`, `4 4`) at the first third. Smooth path via cubic Béziers built from the `HOURLY` temps.

---

## 6. Map (`components/dashboard/MapView.tsx`)

The map fills `.map-stage` (100% × 100%, **no border radius, no inner padding**). All overlays are `position:absolute` with `z-index:500`, children of `.map-stage` (siblings of `MapContainer`, not inside it). Get the map instance with `const [map, setMap] = useState<L.Map | null>(null)` and `<MapContainer ref={setMap} …>`, so overlay buttons can call `map.zoomIn()` etc.

### 6.1 Fix the geometry first (this is the biggest visual bug)

Today's polygons are hard-coded lat/lng (≈ 52.41–52.49 N, 13.01–13.17 E) that fall on the Havel lakes and forest, at zoom 12, so they look like terrain blobs. Replace with fields defined in **metres** around one editable center:

```ts
import L from 'leaflet';

/** Pick a spot where the Esri satellite layer shows rectangular cropland (arable land north-west of Potsdam around
 *  Marquardt / Satzkorn / Fahrland is a good area to look). Run the app, check the 3 fields sit on crops, nudge, done. */
const FARM_CENTER: [number, number] = [52.4650, 13.0000]; // lat, lng  <-- VERIFY ON THE MAP AND ADJUST

const M_LAT = 111_320;
const mLng = (lat: number) => M_LAT * Math.cos((lat * Math.PI) / 180);

/** local metre offset (east, north, rotated) -> [lat, lng] */
function toLatLng(c: [number, number], x: number, y: number, rotDeg: number): [number, number] {
  const r = (rotDeg * Math.PI) / 180;
  const xr = x * Math.cos(r) - y * Math.sin(r);
  const yr = x * Math.sin(r) + y * Math.cos(r);
  return [c[0] + yr / M_LAT, c[1] + xr / mLng(c[0])];
}
function rectRing(c: [number, number], w: number, h: number, rot: number): [number, number][] {
  const k: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]];
  return k.map(([sx, sy]) => { const [lat, lng] = toLatLng(c, (sx * w) / 2, (sy * h) / 2, rot); return [lng, lat] as [number, number]; });
}
function sensorGrid(c: [number, number], w: number, h: number, rot: number, spacing = 32): [number, number][] {
  const pts: [number, number][] = [];
  for (let x = -w / 2 + spacing / 2; x < w / 2; x += spacing)
    for (let y = -h / 2 + spacing / 2; y < h / 2; y += spacing) pts.push(toLatLng(c, x, y, rot));
  return pts;
}
const offset = (c: [number, number], east: number, north: number): [number, number] =>
  [c[0] + north / M_LAT, c[1] + east / mLng(c[0])];
```

Field data (one source of truth; the popup, polygons, labels and counts all read from it):

```ts
type FieldInfo = {
  id: string; name: string; crop: string;
  center: [number, number]; w: number; h: number; rot: number;      // metres / degrees
  planting: string; harvest: string; health: number;                 // health 0-100
  sensors: { humidity: number; temp: number; moisture: number; ph: number };
  insight: string;
};
const FIELDS: FieldInfo[] = [
  { id: '#23BC-12', name: 'Area 1', crop: 'Winter wheat', center: FARM_CENTER,                  w: 560, h: 580, rot: -10, planting: '24 Aug 2026', harvest: '12 Jul 2027', health: 78, sensors: { humidity: 62, temp: 18, moisture: 42, ph: 6.4 }, insight: 'Keep soil moisture above 40 kPa to maximise establishment.' },
  { id: '#23BC-14', name: 'Area 2', crop: 'Field peas',   center: offset(FARM_CENTER, 780, 520),  w: 480, h: 600, rot: -4,  planting: '10 Mar 2026', harvest: '05 Aug 2026', health: 66, sensors: { humidity: 58, temp: 19, moisture: 47, ph: 6.7 }, insight: 'Light irrigation recommended within 3 days.' },
  { id: '#23BC-09', name: 'Area 3', crop: 'Cover crop',   center: offset(FARM_CENTER, 420, -640), w: 420, h: 520, rot: 6,   planting: '02 Sep 2026', harvest: '15 Mar 2027', health: 84, sensors: { humidity: 64, temp: 17, moisture: 39, ph: 6.2 }, insight: 'Ground cover is establishing well; no action needed.' },
];
```

`selectedField` state changes from the old string `'Area 1 · Winter wheat'` to the **field id** (`'#23BC-12'`); update `App.tsx` state and the Field Explorer page accordingly.

Map setup: `zoomSnap={0.5}`, `minZoom={10}`, `maxZoom={18}`, `zoomControl={false}`, `attributionControl={false}`. **Initial view and every selection change:** `map.flyToBounds(fieldBounds, { paddingTopLeft: [40, 100], paddingBottomRight: [panelOpen && window.innerWidth > 850 ? 440 : 60, 60], maxZoom: 16.5, duration: .6 })`, so the selected field is large and not hidden behind the popup. Keep the Esri tile layer.

**Attribution is required by the Esri license.** Since the default control is removed, render `© Esri, Maxar, Earthstar Geographics` as a small `.map-attribution` (11px, white, `text-shadow: 0 1px 2px rgba(0,0,0,.6)`, bottom-center).

### 6.2 Polygon styling

- **Selected field:** 2.5px white outline, fill = vertical gradient light green `#8BD44A` → green `#2E9B3E` at 85% opacity. Leaflet cannot do gradient fills, so render once in the map wrapper `<svg width="0" height="0" style={{position:'absolute'}}><defs><linearGradient id="fieldGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8BD44A" stopOpacity=".85"/><stop offset="1" stopColor="#2E9B3E" stopOpacity=".85"/></linearGradient></defs></svg>`, give the selected path `className: 'field-selected'`, and add `.field-selected { fill: url(#fieldGradient); fill-opacity: 1; }`. **Give `<GeoJSON key={selectedId} …>` a key** so the layers re-mount when selection changes (className is not updated by `setStyle`).
- **Other fields:** outline `#FF8A1F` 2.5px, fill `#FF8A1F` at 22% opacity. Hover: fill 35%.
- **Sensor dots (selected field only, when zoom ≥ 14):** `<CircleMarker>` for each `sensorGrid(...)` point, radius 1.6, white, fillOpacity .75, `weight: 0`, `interactive={false}`, `pane="markerPane"`.
- **Delete** `layer.bindPopup(...)` and the permanent `bindTooltip` labels; clicking a polygon only calls `setSelectedField(id)` and `setPanelOpen(true)`.

### 6.3 Field labels

Per field, a non-interactive `Marker` at the center with a `L.divIcon`:

```ts
const labelIcon = (f: FieldInfo) => L.divIcon({
  className: 'field-label',
  iconSize: [140, 64], iconAnchor: [70, 32],
  html: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg><strong>${f.name}</strong><small>Active Monitoring</small>`,
});
```

`.field-label { display:flex; flex-direction:column; align-items:center; color:#fff; text-shadow: 0 1px 4px rgba(0,0,0,.55); pointer-events:none; } .field-label strong { font-size:18px; font-weight:600; } .field-label small { font-size:12px; opacity:.9; }`

### 6.4 Floating top bar (replaces the app top bar)

`.map-topbar { position:absolute; top:16px; left:16px; right:16px; display:flex; gap:10px; align-items:center; }`

- **Search:** 44px high, `flex: 0 1 460px`, white, radius 12, 14px padding, `Search` icon, placeholder **`Type “/” to search`**. Add a `keydown` listener: pressing `/` (when not typing in an input) focuses it. Remove the ⌘K chip.
- `margin-left:auto`, then **`+ New Crop`** (44px, `--orange` background, white 14/600, radius 12, 18px padding, `Plus` icon; navigates to `rotation-studio`), **`Export`** (44px white, radius 12, navigates to `reports`), and a 44×44 white **bell** button with a 7px red dot (calls `notify('You are all caught up')`).
- On ≤850px, show the hamburger (`.map-menu-btn`, 44×44 white) first and hide the "Export" text button.

### 6.5 Field popup card (replaces `.map-side-card`)

State: `panelOpen` (default true), `selectedId`, `starred: Record<string, boolean>`, `openSection: 'read' | 'log' | null` (default `'read'`).

`.field-card { position:absolute; right:84px; bottom:20px; width:340px; max-height:calc(100% - 140px); overflow:auto; background:#fff; border-radius:22px; padding:18px; box-shadow:var(--shadow-float); }` — it sits **left of the control column**, not under it.

Contents, top to bottom:

1. Title `Area 1 · Winter wheat` (18/600) + clickable star (`Star`, filled `--amber` when starred) ; `X` close button top-right (sets `panelOpen=false`); under it the id `#23BC-12` in `--ink-3` 13px; 1px `--line` divider.
2. Two columns: **Planting date** / **Harvest date** (label 13px `--ink-2`, value 16/500).
3. Row: **Crop Health** (label, `--ink-2`) left, rating text right (≥75 "Good", 50–74 "Fair", else "Poor"); beneath it an 8px progress bar, track `#E6E6E6`, fill `--green` at `health%`, fully rounded.
4. **Accordion "Sensor Read"** (default open): header row 48px with chevron; body is a `--bg-inset` radius-12 block, 14px padding, 4 rows `Humidity / Temperature / Soil Moisture / pH Level` with value right-aligned (`15%`, `32°C`, `42kPa`, `2.5` format per the field's data), rows 36px high.
5. **Accordion "Sensor log"** (closed by default): when opened, shows the last 5 readings, `time · moisture · temp`, same inset style.
6. **AI Insights block:** `--dark` background, radius 16, padding 16, a small green `AI` chip + "Insights" in white 13px, then the insight text (white 15px, line-height 1.4).

When `panelOpen` is false, the card is hidden and **clicking any polygon reopens it**. The card content comes from `FIELDS.find(f => f.id === selectedId)`, so each field shows its own data (today every field shows Area 1's data).

### 6.6 Bottom-left: minimap + scale

- **Minimap:** 128×112, radius 14, 3px white border, `--shadow-float`, at `left:16px; bottom:16px`. Implement as a second `MapContainer` with the same Esri `TileLayer`, `dragging={false} zoomControl={false} scrollWheelZoom={false} doubleClickZoom={false} attributionControl={false}`, `bounds` = all field bounds padded by 0.8, plus a `<Rectangle>` (white, weight 2, `fill:false`) whose `bounds` = main map's `getBounds()`, stored in state and refreshed on the main map's `moveend`. Delete the fake `.map-minimap` spans.
- **Scale:** keep Leaflet `ScaleControl` (metric only) but move it to `left: 160px; bottom: 16px`, transparent background, white 11px text with text-shadow, 2px white bottom/left/right border ticks.

### 6.7 Bottom-right: dark control stack

`.map-controls { position:absolute; right:20px; bottom:20px; display:flex; flex-direction:column; gap:10px; }`, each control 44px wide, `--dark` background, white icon, radius 12, hover `#3A3A3A`:

1. **Layers** (`Layers3`): toggles `.layers-pop` (see 6.8).
2. **Fullscreen** (`Maximize2`): `map-stage` `requestFullscreen()` / `document.exitFullscreen()`.
3. **Zoom pair** (one 44×88 block, divider between): `+` → `map.zoomIn()`, `−` → `map.zoomOut()`. Delete the fake `.map-zoom-fallback` and the `ZoomControl` from Leaflet.
4. **Locate** (`Navigation`): `map.flyToBounds` to the selected field (same call as section 6.1).
5. **"2D"** text button (13/600): non-functional in this demo; on click `notify('3D view is not available in this demo')`.

### 6.8 Layers popover

The old always-visible "Map layers" panel becomes a popover opened from the stack: `.layers-pop { position:absolute; right:84px; bottom:20px; width:230px; background:#fff; border-radius:16px; padding:12px; box-shadow:var(--shadow-float); }` (if the field card is open, offset it above: `bottom: 20px` becomes `bottom: calc(100% - 100px)` is **not** wanted; simply hide the field card on mobile and place the popover at `bottom: 84px` when both are open). Keep the four rows (Vegetation health, Soil moisture, Rainfall, Temperature) with the existing toggle logic, restyled: 44px rows, `--green` toggle, 13px text, a `Compass` reset button in the header. Keep the existing `notify('Scientific overlay integration pending')` honesty message.

---

## 7. Other pages (Field Explorer, Environment, Farmer Profile, Rotation Studio, Scenario, Reports)

Keep their structure and content. Only harmonise them with the new language:

- Page background `--bg-panel`; `.card` = `--bg-card`, radius 22px, **no border, no shadow**, padding 20px.
- `.topbar` (still shown on these pages): transparent background, no border-bottom, height 64px; `Back`, farm select, search and Export use white radius-12 pills, no outline borders; avatar stays.
- `.primary-button` → `--orange` background, white text, radius 12, height 40px, no shadow. `.outline-button` → white background, no border. Green is no longer used for buttons.
- Tabs (`.tabs`, `.studio-tabs`) → segmented control: white pill container radius 12, active tab `--dark` background + white text, radius 10.
- Field Explorer reuses `MapView`: add a prop `floatingChrome?: boolean` (default true). Pass `false` there so the map shows only the control stack, minimap, scale and field card, not the search / New Crop / Export / bell bar (the page already has a title and farm list).
- Update `FieldExplorer`'s farm list to the same card style; selecting a field there must set `selectedField` by id.

---

## 8. Responsive behaviour

| Viewport | Behaviour |
| --- | --- |
| ≥ 1100px | rail 64px · panel `clamp(400px, 33vw, 560px)` · map fills the rest |
| 851–1099px | `--panel-w: 360px`; field card width 300px; minimap hidden |
| ≤ 850px | rail becomes a drawer (hamburger on the map); `.dashboard-grid` becomes a single column: **map first at `height: 72dvh`**, panel below and scrollable; field card becomes a **bottom sheet** (`left:12px; right:12px; bottom:12px; width:auto; max-height:55%`); controls stack stays bottom-right but **minimap, scale and "2D" are hidden**; search shrinks to `flex:1` |
| ≤ 560px | New Crop becomes icon-only; panel padding 8px; metric value 28px |

No horizontal scrolling at any width ≥ 360px.

---

## 9. Data and copy fixes (spotted in the current build)

- **pH is inconsistent:** the snapshot says 6.4 but the selected-field sensor panel says **2.5** (copied from the reference mockup). pH 2.5 would be lethal to crops and contradicts "Crop health: Good". Use per-field values from `FIELDS` (≈ 6.2–6.7).
- **Dates are in the past** (planting 24 Aug 2025 / harvest 12 Nov 2025). Use the 2026/2027 dates from section 6.1.
- **Every field showed Area 1's id and readings.** Fixed by the data-driven card in 6.5.
- Keep the `DEMO DATA` badge in the property card and the "Scientific overlay integration pending" message.

---

## 10. Acceptance checklist (verify at 1440×900, 1920×1080, 1024×768, 390×844)

- [ ] Dashboard has **no white top bar**; light-gray 64px rail with grouped icons and hover tooltips; active item is a dark rounded square.
- [ ] Left panel is gray with borderless off-white cards, 22px radius, 10px gaps; nothing smaller than 11px.
- [ ] Header pills (Back, ● 3 Field active, kebab) present.
- [ ] Metrics show big values with Max/Min columns; **Max ≥ Min** everywhere.
- [ ] Tick gauge (60 ticks) with a dark marker at the score; AI Insights chip row below it.
- [ ] Soil chart is stepped/color-coded with a highlighted column and a dark tooltip that follows hover.
- [ ] Weather card has icon strip + orange area chart with dashed "now" line.
- [ ] On load, the map is zoomed to **Area 1 on actual cropland** (not lakes/forest); Area 1 has green gradient fill, white outline, sensor dots, signal-icon label with "Active Monitoring"; Areas 2 and 3 are orange-tinted.
- [ ] Clicking another polygon moves the highlight, flies the map to it, and **changes every value in the field card**; ✕ closes the card; clicking a polygon reopens it.
- [ ] Floating search (`/` focuses it), orange **+ New Crop**, Export, bell sit on the map top edge.
- [ ] Bottom-right dark stack works: layers popover, fullscreen, zoom in/out, locate, 2D notice. Minimap rectangle follows panning. Scale bar visible. Esri attribution visible.
- [ ] Other pages still work and share the new tokens (orange primary buttons, borderless cards).
- [ ] `npm run typecheck`, `npm run lint`, `npm run build` all pass; no console errors; old CSS rules from section 3 are gone (no override stacking); `src/App.tsx` is smaller than before.
