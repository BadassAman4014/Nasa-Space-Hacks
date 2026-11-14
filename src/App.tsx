import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GeoJSON, MapContainer, ScaleControl, TileLayer, ZoomControl } from 'react-leaflet';
import type { FeatureCollection, Polygon } from 'geojson';
import 'leaflet/dist/leaflet.css';
import { SidebarV2 } from './components/shell/Sidebar';
import { DashboardV2 } from './components/dashboard/Dashboard';
import { FieldExplorerView } from './components/fields/FieldExplorerView';
import { FieldAnalyticsWorkspace } from './components/analytics/FieldAnalyticsWorkspace';
import { WeatherView } from './components/weather/WeatherView';
import { AIAssistantView } from './components/ai-assistant/AIAssistantView';
import {
  Activity, ArrowLeft, BarChart3, Bell, BrainCircuit, Check, ChevronDown, ChevronRight,
  CircleHelp, CloudRain, CloudSun, Compass, Download, Droplets, Eye, FileText, Globe2,
  Layers3, Leaf, Map, MapPin, Menu, MoreHorizontal, Navigation, Plus, Search, Settings,
  ShieldCheck, SlidersHorizontal, Sprout, Sun, Thermometer, TrendingUp, Users, X, Zap
} from 'lucide-react';

type PageKey =
  | 'dashboard'
  | 'fields'
  | 'analytics'
  | 'ai-assistant'
  | 'weather'
  | 'environment'
  | 'farmer-profile'
  | 'rotation-studio'
  | 'scenario-simulator'
  | 'reports';
const navItems: { id: PageKey; label: string; icon: typeof Map }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'fields', label: 'Field Explorer', icon: Map },
  { id: 'analytics', label: 'Field Analytics', icon: Zap },
  { id: 'ai-assistant', label: 'AI Assistant', icon: BrainCircuit },
  { id: 'weather', label: 'Weather', icon: CloudSun },
  { id: 'environment', label: 'Environmental Profile', icon: Globe2 },
  { id: 'farmer-profile', label: 'Farmer Profile', icon: Users },
  { id: 'rotation-studio', label: 'Rotation Studio', icon: Sprout },
  { id: 'scenario-simulator', label: 'Scenario Simulator', icon: SlidersHorizontal },
  { id: 'reports', label: 'Reports & Evidence', icon: FileText },
];

function App() {
  const [page, setPage] = useState<PageKey>(() => (window.location.pathname.slice(1) as PageKey) || 'dashboard');
  const [analyticsFieldId, setAnalyticsFieldId] = useState<string>('field-c6bb6ab214');
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    async function resolveActiveField() {
      try {
        const resp = await fetch('http://localhost:8000/api/fields');
        if (resp.ok) {
          const list = await resp.json();
          if (Array.isArray(list) && list.length > 0) {
            setAnalyticsFieldId((prev) => (list.some((f) => f.id === prev) ? prev : list[0].id));
          }
        }
      } catch (e) {
        console.warn('Could not auto-resolve initial field ID:', e);
      }
    }
    resolveActiveField();
  }, []);

  const navigate = (next: PageKey, extraFieldId?: string) => {
    if (extraFieldId) setAnalyticsFieldId(extraFieldId);
    setPage(next);
    setMobileNav(false);
    window.history.pushState({}, '', `/${next}`);
  };
  const notify = useCallback((message: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast(message);
    timerRef.current = window.setTimeout(() => setToast(null), 3600);
  }, []);

  return (
    <div
      className={`app-shell ${page === 'dashboard' ? 'app-shell--map-full' : ''} ${
        page === 'fields' ? 'app-shell--field-explorer' : ''
      } ${page === 'analytics' ? 'app-shell--analytics' : ''} ${
        page === 'ai-assistant' ? 'app-shell--ai-assistant' : ''
      }`}
    >
      <SidebarV2 page={page} navigate={navigate} mobileOpen={mobileNav} onClose={() => setMobileNav(false)} notify={notify} />
      <main className="workspace">
        {page !== 'dashboard' && page !== 'fields' && page !== 'analytics' && page !== 'weather' && page !== 'ai-assistant' && (
          <Topbar navigate={navigate} onMenu={() => setMobileNav(true)} onNotify={() => notify('You are all caught up')} />
        )}
        <div
          className={`page-content ${
            page === 'dashboard' || page === 'fields' || page === 'analytics' || page === 'weather' || page === 'ai-assistant'
              ? 'page-content--bleed'
              : ''
          }`}
        >
          {page === 'dashboard' && (
            <DashboardV2
              navigate={navigate}
              notify={notify}
              onMenu={() => setMobileNav(true)}
              selectedFieldId={analyticsFieldId}
              onSelectField={(id) => setAnalyticsFieldId(id)}
            />
          )}
          {page === 'fields' && <FieldExplorer notify={notify} navigate={navigate} />}
          {page === 'analytics' && (
            <FieldAnalyticsWorkspace
              fieldId={analyticsFieldId}
              onClose={() => navigate('dashboard')}
              notify={notify}
              onSelectField={(id) => setAnalyticsFieldId(id)}
            />
          )}
          {page === 'ai-assistant' && (
            <AIAssistantView
              notify={notify}
              navigate={navigate}
              initialFieldId={analyticsFieldId}
            />
          )}
          {page === 'weather' && (
            <WeatherView
              initialFieldId={analyticsFieldId}
              onNavigateFieldAnalytics={(fieldId) => {
                setAnalyticsFieldId(fieldId);
                navigate('analytics', fieldId);
              }}
            />
          )}
          {page === 'environment' && <Environment />}
          {page === 'farmer-profile' && <FarmerProfile notify={notify} />}
          {page === 'rotation-studio' && <RotationStudio notify={notify} />}
          {page === 'scenario-simulator' && <ScenarioSimulator notify={notify} />}
          {page === 'reports' && <Reports notify={notify} />}
        </div>
      </main>
      {toast && (
        <div className="toast" role="alert" aria-live="polite">
          <div className="toast-icon">
            {toast.toLowerCase().includes('caught up') ? (
              <Bell size={16} strokeWidth={2.5} />
            ) : (
              <Check size={16} strokeWidth={2.5} />
            )}
          </div>
          <div className="toast-body">
            <span className="toast-title">
              {toast.toLowerCase().includes('caught up') ? 'Notification' : 'Update'}
            </span>
            <span className="toast-msg">{toast}</span>
          </div>
          <button
            type="button"
            className="toast-close"
            onClick={() => setToast(null)}
            title="Dismiss notification"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// Legacy shell retained temporarily for the non-dashboard helpers below.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function Sidebar({ page, navigate, mobileOpen, onClose }: { page: PageKey; navigate: (page: PageKey) => void; mobileOpen: boolean; onClose: () => void }) {
  return <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
    <div className="brand"><div className="brand-mark"><Leaf size={20} /></div><span>fieldshift<span className="brand-ai">AI</span></span><button className="mobile-close" onClick={onClose}><X size={18} /></button></div>
    <div className="sidebar-caption">WORKSPACE</div>
    <nav className="nav-list">{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => navigate(id)}><Icon size={18} /><span>{label}</span>{id === 'rotation-studio' && <span className="new-pill">NEW</span>}</button>)}</nav>
    <div className="sidebar-bottom"><div className="sidebar-caption">YOUR REGION</div><div className="region"><MapPin size={15} /><span>Brandenburg, DE</span><ChevronRight size={14} /></div><button className="nav-item"><Settings size={18} /><span>Settings</span></button><button className="nav-item"><CircleHelp size={18} /><span>Help center</span></button><div className="user-card"><div className="avatar">JS</div><div><strong>Jonas Schmidt</strong><small>Farm manager</small></div><MoreHorizontal size={17} /></div></div>
  </aside>;
}

function Topbar({ navigate, onMenu, onNotify }: { navigate: (page: PageKey) => void; onMenu: () => void; onNotify: () => void }) {
  return <header className="topbar"><button className="menu-button" onClick={onMenu}><Menu size={20} /></button><button className="back-button" onClick={() => navigate('dashboard')}><ArrowLeft size={16} /> <span>Back</span></button><div className="top-search"><Search size={16} /><input placeholder="Search fields, farms or locations" /><span className="shortcut">⌘ K</span></div><div className="top-actions"><button className="outline-button hide-small" onClick={() => navigate('reports')}><Download size={15} /> Export</button><button className="icon-button" onClick={onNotify}><Bell size={18} /><span className="notification-dot" /></button><button className="avatar top-avatar">JS</button></div></header>;
}

function PageTitle({ eyebrow, title, description, action, onAction }: { eyebrow: string; title: string; description?: string; action?: string; onAction?: () => void }) { return <div className="page-title"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action && <button className="primary-button" onClick={onAction}><Plus size={16} /> {action}</button>}</div>; }
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) { return <section className={`card ${className}`}>{children}</section>; }
function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) { return <div className="card-header"><div><h3>{title}</h3>{subtitle && <span>{subtitle}</span>}</div>{action}</div>; }
function Metric({ label, value, unit, trend, icon: Icon, tone = 'green' }: { label: string; value: string; unit?: string; trend?: string; icon: typeof Droplets; tone?: string }) { return <div className="metric"><div className="metric-top"><span>{label}</span><span className={`metric-icon ${tone}`}><Icon size={16} /></span></div><div className="metric-value">{value}<small>{unit}</small></div>{trend && <div className="metric-trend"><TrendingUp size={13} /> {trend}</div>}</div>; }

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function Dashboard({ farmName, selectedFarm, selectedField, setSelectedField, layers, setLayers, navigate, notify }: { farmName: string; selectedFarm?: any; selectedField: string; setSelectedField: (value: string) => void; layers: any; setLayers: (value: any) => void; navigate: (page: PageKey) => void; notify: (message: string) => void }) {
  return <><PageTitle eyebrow="OVERVIEW · DEMO DATA" title={farmName === 'All Farms' ? 'Good morning, Jonas' : farmName} description={selectedFarm ? `${selectedFarm.location} · ${selectedFarm.area} under management` : 'Your regional snapshot across 5 farms · 658 ha under management'} action="New field" onAction={() => navigate('fields')} /><div className="dashboard-grid"><div className="dashboard-sidebar"><Card><CardHeader title="Environmental snapshot" subtitle="Brandenburg · last 30 days" action={<button className="kebab"><MoreHorizontal size={17} /></button>} /><div className="metrics-grid"><Metric label="Avg temperature" value="18.4" unit="°C" trend="2.1% vs last year" icon={Thermometer} /><Metric label="Rainfall" value="42" unit="mm" trend="8% below average" icon={CloudRain} tone="orange" /><Metric label="Soil moisture" value="43" unit="kPa" trend="Stable this week" icon={Droplets} /><Metric label="Soil pH" value="6.4" trend="Healthy range" icon={Activity} tone="blue" /></div></Card><Suitability /><SoilChart /><Weather /></div><div className="map-card"><MapView selectedField={selectedField} setSelectedField={setSelectedField} layers={layers} setLayers={setLayers} notify={notify} /></div></div></>;
}

function Suitability() { return <Card className="suitability-card"><CardHeader title="Area suitability" subtitle="Current crop conditions" action={<span className="status-badge good"><span /> Good for planting</span>} /><div className="suitability-score"><div><strong>82</strong><span>/100</span><p>Overall suitability score</p></div><div className="score-ring"><div><strong>82</strong><small>GOOD</small></div></div></div><div className="score-bar"><span style={{ width: '82%' }} /></div><div className="muted-note"><BrainCircuit size={15} /> Soil moisture and rainfall are supporting healthy establishment.</div></Card>; }
function SoilChart() { return <Card><CardHeader title="Soil condition" subtitle="Moisture trend · today" action={<span className="chart-label"><Droplets size={14} /> 90% water</span>} /><div className="chart"><div className="chart-y"><span>60</span><span>40</span><span>20</span><span>0</span></div><div className="chart-area"><div className="grid-lines" /><svg viewBox="0 0 520 130" preserveAspectRatio="none"><defs><linearGradient id="soilFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#2BAA6A" stopOpacity=".22" /><stop offset="1" stopColor="#2BAA6A" stopOpacity="0" /></linearGradient></defs><path d="M0 105 C30 92 45 110 70 95 S110 75 130 82 S160 95 180 66 S215 72 235 53 S270 80 300 55 S335 45 360 60 S395 44 420 50 S450 88 480 74 S500 80 520 60 L520 130 L0 130 Z" fill="url(#soilFill)" /><path d="M0 105 C30 92 45 110 70 95 S110 75 130 82 S160 95 180 66 S215 72 235 53 S270 80 300 55 S335 45 360 60 S395 44 420 50 S450 88 480 74 S500 80 520 60" fill="none" stroke="#168653" strokeWidth="3" /></svg><div className="chart-x"><span>06:00</span><span>09:00</span><span>12:00</span><span>15:00</span><span>18:00</span><span>21:00</span><span>24:00</span></div></div></div></Card>; }
function Weather() { return <Card className="weather-card"><CardHeader title="Weather forecast" subtitle="Potsdam station · updated 10 min ago" action={<CloudSun size={20} color="#818984" />} /><div className="current-weather"><div><Sun size={30} color="#F4A340" /><strong>27°</strong><span>Partly cloudy<br /><small>Feels like 29°</small></span></div><div className="condition-chip">Conditions <ChevronDown size={14} /></div></div><div className="forecast-row">{['Now', '14:00', '16:00', '18:00', '20:00'].map((time, index) => <div key={time}><span>{time}</span>{index % 2 ? <CloudSun size={18} color="#819894" /> : <Sun size={18} color="#F4A340" />}<strong>{27 - index}°</strong></div>)}</div></Card>; }

type FieldProperties = { id: string; name: string; selected: boolean };
const fieldGeoJson: FeatureCollection<Polygon, FieldProperties> = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { id: '#23BC-12', name: 'Area 1 · Winter wheat', selected: true }, geometry: { type: 'Polygon', coordinates: [[[13.015, 52.45], [13.055, 52.47], [13.08, 52.43], [13.04, 52.41], [13.015, 52.45]]] } },
    { type: 'Feature', properties: { id: '#23BC-14', name: 'Area 2 · Field peas', selected: false }, geometry: { type: 'Polygon', coordinates: [[[13.09, 52.48], [13.145, 52.49], [13.17, 52.45], [13.11, 52.44], [13.09, 52.48]]] } },
    { type: 'Feature', properties: { id: '#23BC-09', name: 'Area 3 · Cover crop', selected: false }, geometry: { type: 'Polygon', coordinates: [[[13.08, 52.405], [13.125, 52.415], [13.145, 52.385], [13.095, 52.38], [13.08, 52.405]]] } },
  ],
};

function MapView({ selectedField, setSelectedField, layers, setLayers, notify }: { selectedField: string; setSelectedField: (value: string) => void; layers: any; setLayers: (value: any) => void; notify: (message: string) => void }) {
  const selectedName = selectedField;
  const layerStyle = (feature?: { properties?: { name?: string } }) => ({
    color: feature?.properties?.name === selectedName ? '#FFFFFF' : '#F4A340',
    weight: feature?.properties?.name === selectedName ? 3 : 2,
    fillColor: feature?.properties?.name === selectedName ? '#A7E58A' : '#F4A340',
    fillOpacity: feature?.properties?.name === selectedName ? 0.42 : 0.18,
  });
  const onEachField = (feature: { properties?: { name?: string } }, layer: { bindTooltip: (content: string, options: object) => void; bindPopup: (content: string) => void; on: (events: object) => void }) => {
    const name = feature.properties?.name ?? 'Field';
    layer.bindTooltip(name.split(' · ')[0], { permanent: true, direction: 'center', className: 'field-tooltip' });
    layer.bindPopup(`<strong>${name}</strong><br />Click to inspect this field.`);
    layer.on({ click: () => setSelectedField(name) });
  };

  return <div className="map-view real-map-view">
    <MapContainer center={[52.435, 13.09]} zoom={12} scrollWheelZoom zoomControl={false} className="leaflet-map">
      <TileLayer attribution='&copy; Esri, Maxar, Earthstar Geographics' url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
      <GeoJSON data={fieldGeoJson} style={layerStyle} onEachFeature={onEachField} />
      <ZoomControl position="bottomright" />
      <ScaleControl position="bottomleft" imperial={false} />
    </MapContainer>
    <div className="map-toolbar"><button className="map-control active" onClick={() => notify('Satellite imagery is active')}><Layers3 size={16} /> Satellite</button><button className="map-control" onClick={() => notify('Field search is ready')}><Search size={16} /> Search</button></div>
    <div className="map-layer-popover"><div className="layers-title"><strong>Map layers</strong><button onClick={() => notify('Map view reset')}><Compass size={15} /></button></div>{[['ndvi', 'Vegetation health', Leaf], ['moisture', 'Soil moisture', Droplets], ['rainfall', 'Rainfall', CloudRain], ['temperature', 'Temperature', Thermometer]].map(([key, label, Icon]) => <button className="layer-row" key={key as string} onClick={() => { setLayers({ ...layers, [key as string]: !layers[key as string] }); notify('Scientific overlay integration pending'); }}><span className={`toggle ${layers[key as string] ? 'on' : ''}`}><span /></span><Icon size={15} /><span>{label as string}</span></button>)}</div>
    <div className="map-side-card"><div className="selected-tag"><span /> SELECTED FIELD</div><h3>{selectedName.split(' · ')[0]}</h3><p>Greenfield Farm · Brandenburg</p><div className="field-stat-grid"><div><span>Field ID</span><strong>#23BC-12</strong></div><div><span>Crop health</span><strong className="green-text">Good</strong></div><div><span>Planting date</span><strong>24 Aug 2025</strong></div><div><span>Harvest date</span><strong>12 Nov 2025</strong></div></div><div className="sensor-readings"><strong>Sensor readings</strong><span>Humidity <b>15%</b></span><span>Temperature <b>32°C</b></span><span>Soil moisture <b>42 kPa</b></span><span>Soil pH <b>2.5</b></span></div><div className="ai-insight"><BrainCircuit size={16} /><div><strong>AI insight</strong><p>Keep soil moisture above 40 kPa to maximise establishment.</p></div></div></div>
    <div className="map-zoom-fallback"><button onClick={() => notify('Use the map controls to zoom in')}><Plus size={17} /></button><button onClick={() => notify('Use the map controls to zoom out')}><span className="minus">−</span></button><button onClick={() => notify('Centered on Brandenburg')}><Navigation size={16} /></button></div><div className="map-mode">2D</div><div className="map-minimap"><span /><span /><span /></div>
  </div>;
}
function FieldExplorer({ notify, navigate }: { notify: (message: string) => void; navigate: (page: PageKey) => void }) {
  return <FieldExplorerView onNotify={notify} onNavigateDashboard={() => navigate('dashboard')} />;
}

function Environment() { const [tab, setTab] = useState('Overview'); return <><PageTitle eyebrow="ENVIRONMENTAL PROFILE · DEMO DATA" title="Environmental intelligence" description="A clear view of the conditions shaping your fields today." /><div className="tabs">{['Overview', 'Climate', 'Soil', 'Vegetation', 'Detailed data'].map((item) => <button className={tab === item ? 'active' : ''} onClick={() => setTab(item)} key={item}>{item}</button>)}</div><div className="env-grid"><Card><CardHeader title={tab === 'Overview' ? 'Key indicators' : `${tab} indicators`} subtitle="Selected region · Brandenburg" action={<span className="data-badge">DEMO DATA</span>} /><div className="indicator-grid"><Indicator label="Rainfall anomaly" value="−8%" note="vs 10-year average" icon={CloudRain} tone="orange" /><Indicator label="Soil moisture" value="+4%" note="within healthy range" icon={Droplets} /><Indicator label="Heat exposure" value="6 days" note="above 30°C this season" icon={Sun} tone="yellow" /><Indicator label="Vegetation health" value="0.72" note="NDVI index · healthy" icon={Leaf} /><Indicator label="Organic carbon" value="2.1%" note="estimated · 0–30 cm" icon={Sprout} /><Indicator label="Soil pH" value="6.4" note="slightly acidic" icon={Activity} tone="blue" /></div></Card><Card className="large-chart-card"><CardHeader title={tab === 'Vegetation' ? 'NDVI time series' : 'Monthly rainfall & temperature'} subtitle="Jan 2024 — Dec 2025" action={<button className="select-mini">Last 24 months <ChevronDown size={14} /></button>} /><DataChart variant={tab === 'Vegetation' ? 'ndvi' : 'rain'} /></Card><Card><CardHeader title="Data provenance" subtitle="Understand what each observation means" /><div className="provenance-list"><DataSource name="NASA POWER" type="Modelled climate" date="12 Nov 2025" /><DataSource name="NASA SMAP" type="Satellite-derived" date="10 Nov 2025" /><DataSource name="SoilGrids" type="Estimated soil profile" date="2024 baseline" /></div></Card><Card><CardHeader title="Soil composition" action={<button className="text-button">View details <ChevronRight size={14} /></button>} /><div className="soil-composition"><div className="donut"><span>Loam</span><small>texture</small></div><div className="composition-bars"><div><span>Sand</span><strong>42%</strong><i style={{ width: '42%' }} /></div><div><span>Silt</span><strong>38%</strong><i style={{ width: '38%' }} /></div><div><span>Clay</span><strong>20%</strong><i style={{ width: '20%' }} /></div></div></div></Card></div></>; }
function Indicator({ label, value, note, icon: Icon, tone = 'green' }: { label: string; value: string; note: string; icon: typeof CloudRain; tone?: string }) { return <div className="indicator"><div className={`indicator-icon ${tone}`}><Icon size={17} /></div><span>{label}<CircleHelp size={12} /></span><strong>{value}</strong><small>{note}</small></div>; }
function DataChart({ variant }: { variant: 'ndvi' | 'rain' }) { return <div className="data-chart"><div className="legend"><span><i className="legend-green" /> {variant === 'ndvi' ? 'NDVI health' : 'Rainfall'}</span><span><i className="legend-orange" /> {variant === 'ndvi' ? 'Historical average' : 'Temperature'}</span></div><svg viewBox="0 0 760 220" preserveAspectRatio="none"><g className="svg-grid"><path d="M0 40H760M0 90H760M0 140H760M0 190H760" /></g><path d={variant === 'ndvi' ? 'M0 150 C35 165 60 145 90 130 S145 145 180 120 S235 105 270 130 S320 80 360 100 S405 120 440 90 S485 80 520 105 S570 80 610 70 S660 95 700 75 S735 70 760 45' : 'M0 145 C40 130 60 90 100 120 S150 160 190 100 S240 135 280 65 S330 110 370 140 S420 120 460 150 S520 170 560 110 S610 85 650 105 S710 50 760 90'} fill="none" stroke="#168653" strokeWidth="3" /><path d="M0 165 C50 150 80 160 120 145 S190 150 230 125 S300 145 350 125 S410 140 460 120 S530 130 580 105 S650 115 700 100 S740 110 760 95" fill="none" stroke="#F4A340" strokeWidth="2" strokeDasharray="6 6" /></svg><div className="months"><span>Jan '24</span><span>Apr</span><span>Jul</span><span>Oct</span><span>Jan '25</span><span>Apr</span><span>Jul</span><span>Oct</span></div></div>; }
function DataSource({ name, type, date }: { name: string; type: string; date: string }) { return <div className="source-row"><div className="source-icon"><Globe2 size={16} /></div><div><strong>{name}</strong><small>{type} · {date}</small></div><Check size={15} color="#168653" /></div>; }

function FarmerProfile({ notify }: { notify: (message: string) => void }) { const [step, setStep] = useState(1); const [saved, setSaved] = useState(false); const [priorities, setPriorities] = useState([80, 65, 72, 48, 58, 62, 45]); const names = ['Water conservation', 'Soil health', 'Drought resilience', 'Nitrogen contribution', 'Erosion reduction', 'Profitability', 'Crop diversity']; return <><PageTitle eyebrow="FARMER PROFILE" title="Tell us about your farm" description="Your priorities help FieldShift make recommendations that fit the way you farm." action={saved ? 'Saved' : 'Save profile'} onAction={() => { setSaved(true); notify('Farmer profile saved'); }} /><div className="profile-layout"><Card className="step-card"><div className="stepper">{['Farm details', 'Crop history', 'Priorities', 'Constraints'].map((label, index) => <button onClick={() => setStep(index + 1)} className={step === index + 1 ? 'active' : step > index + 1 ? 'done' : ''} key={label}><span>{step > index + 1 ? <Check size={14} /> : index + 1}</span>{label}</button>)}</div><div className="form-content">{step === 1 && <><h2>Farm details</h2><p className="form-intro">Start with the basics so we can tailor field-level recommendations.</p><div className="form-grid"><label>Farm name<input defaultValue="Greenfield Farm" /></label><label>Location<input defaultValue="Potsdam, Brandenburg" /></label><label>Farming type<select defaultValue="Conventional"><option>Conventional</option><option>Organic</option><option>Mixed</option></select></label><label>Irrigation availability<select defaultValue="Limited access"><option>Full access</option><option>Limited access</option><option>Rain-fed only</option></select></label></div><label>Fields included<div className="choice-row"><button className="choice selected"><Check size={15} /> North block · 32 ha</button><button className="choice selected"><Check size={15} /> Riverside · 28 ha</button><button className="choice"><Plus size={15} /> Add another field</button></div></label></>}{step === 2 && <CropHistory />}{step === 3 && <><h2>What matters most?</h2><p className="form-intro">Adjust the sliders to reflect your current farming priorities.</p><div className="priority-list">{names.map((name, index) => <label key={name}><div><strong>{name}</strong><span>{priorities[index]}%</span></div><input type="range" min="0" max="100" value={priorities[index]} onChange={(e) => setPriorities(priorities.map((value, i) => i === index ? Number(e.target.value) : value))} /></label>)}</div></>}{step === 4 && <><h2>Additional constraints</h2><p className="form-intro">Optional context makes recommendations more practical.</p><div className="constraint-grid"><label>Equipment limitations<textarea placeholder="e.g. No direct drill available" /></label><label>Market preferences<textarea placeholder="e.g. Local mill contract for wheat" /></label><label>Livestock or forage requirements<textarea placeholder="e.g. 20 ha forage needed" /></label><label>Fertilizer practices<textarea placeholder="e.g. Reduced synthetic nitrogen" /></label></div></>}<div className="form-actions"><button className="outline-button" disabled={step === 1} onClick={() => setStep(step - 1)}>Previous</button><button className="primary-button" onClick={() => step < 4 ? setStep(step + 1) : notify('Profile complete — ready for recommendations')}>{step === 4 ? 'Finish profile' : 'Continue'} <ChevronRight size={16} /></button></div></div></Card><Card className="profile-aside"><div className="aside-illustration"><Sprout size={36} /></div><h3>Why we ask</h3><p>FieldShift combines your practical experience with environmental evidence. You stay in control of the decision.</p><div className="aside-list"><div><ShieldCheck size={16} /><span>Your data stays private</span></div><div><BrainCircuit size={16} /><span>Recommendations are explainable</span></div><div><Eye size={16} /><span>Every input can be changed</span></div></div></Card></div></>; }
function CropHistory() { return <><h2>Your crop history</h2><p className="form-intro">A short history helps us avoid repeating crop families and balance soil demand.</p><div className="history-list">{['2025', '2024', '2023', '2022', '2021'].map((year, index) => <div className="history-row" key={year}><strong>{year}</strong><select defaultValue={index === 0 ? 'Winter wheat' : index === 1 ? 'Field peas' : index === 2 ? 'Winter barley' : index === 3 ? 'Cover crop' : 'Rapeseed'}><option>Winter wheat</option><option>Field peas</option><option>Winter barley</option><option>Cover crop</option><option>Rapeseed</option><option>Potatoes</option></select><span className="history-status"><Check size={14} /> Recorded</span></div>)}</div></>; }

function RotationStudio({ notify }: { notify: (message: string) => void }) { const [generated, setGenerated] = useState(false); const [active, setActive] = useState('comparison'); return <><PageTitle eyebrow="ROTATION STUDIO · DECISION SUPPORT" title="Design a better rotation" description="Compare practical pathways for healthier soils and more resilient harvests." action={generated ? 'Regenerate' : 'Generate recommendations'} onAction={() => { setGenerated(true); notify('Three strategies generated from your profile'); }} /><div className="studio-banner"><div className="banner-icon"><BrainCircuit size={22} /></div><div><strong>{generated ? 'Recommendations ready for review' : 'Ready to explore your options?'}</strong><p>{generated ? 'Each pathway is scored against your priorities and current field conditions.' : 'We will compare three transparent strategies using your profile and environmental evidence.'}</p></div><div className="confidence"><span>Model confidence</span><strong>Moderate</strong><small>Based on demo inputs</small></div></div><div className="studio-tabs">{[['comparison', 'Strategy comparison'], ['timeline', 'Timeline'], ['metrics', 'Metrics'], ['evidence', 'Evidence']].map(([id, label]) => <button className={active === id ? 'active' : ''} onClick={() => setActive(id)} key={id}>{label}</button>)}</div>{active === 'comparison' && <div className="strategy-grid">{[{ name: 'Existing rotation', tag: 'BASELINE', score: 62, description: 'Your current pattern, used as a transparent baseline.', color: 'neutral', crops: ['Winter wheat', 'Field peas', 'Winter barley', 'Cover crop'], benefits: ['Familiar equipment', 'Known market route'], risks: ['Lower crop diversity'] }, { name: 'Water-resilient', tag: 'RECOMMENDED', score: 84, description: 'Prioritises water conservation and drought tolerance.', color: 'green', crops: ['Winter wheat', 'Field peas', 'Sorghum', 'Cover crop'], benefits: ['Lower water demand', 'Stronger dry-year fit'], risks: ['New crop learning curve'] }, { name: 'Soil-health focused', tag: 'ALTERNATIVE', score: 79, description: 'Builds soil structure through diversity and root activity.', color: 'blue', crops: ['Winter barley', 'Clover', 'Winter wheat', 'Field peas'], benefits: ['Nitrogen contribution', 'More soil cover'], risks: ['Less flexible harvest window'] }].map((strategy) => <StrategyCard key={strategy.name} {...strategy} onCompare={() => notify(`${strategy.name} added to comparison`)} />)}</div>}{active === 'timeline' && <Card><CardHeader title="Four-year rotation timeline" subtitle="Water-resilient strategy · Greenfield Farm" /><div className="timeline">{['2026', '2027', '2028', '2029'].map((year, index) => <div className="timeline-year" key={year}><span>{year}</span><div className={`crop-tile crop-${index}`}><Sprout size={22} /><strong>{['Winter wheat', 'Field peas', 'Sorghum', 'Cover crop'][index]}</strong><small>{['High water efficiency', 'Nitrogen fixing', 'Drought tolerant', 'Soil protection'][index]}</small></div>{index < 3 && <ChevronRight className="timeline-arrow" />}</div>)}</div></Card>}{active === 'metrics' && <Card><CardHeader title="Strategy metrics" subtitle="Relative scores across your priorities" /><div className="comparison-table">{['Water demand', 'Nitrogen contribution', 'Soil cover', 'Crop diversity', 'Drought suitability', 'Market suitability'].map((label, index) => <div className="table-row" key={label}><strong>{label}</strong><span>{[62, 44, 55, 50, 68, 75][index]}</span><i><b style={{ width: `${[62, 44, 55, 50, 68, 75][index]}%` }} /></i><em>{[78, 82, 91, 88, 86, 67][index]}</em><i><b className="orange-bar" style={{ width: `${[78, 82, 91, 88, 86, 67][index]}%` }} /></i></div>)}</div></Card>}{active === 'evidence' && <Card><CardHeader title="Why this was recommended" subtitle="Evidence linked to the water-resilient strategy" /><div className="evidence-list"><Evidence icon={Droplets} title="Rainfall variability" text="The last 24 months show an 8% rainfall deficit against the regional average." /><Evidence icon={Leaf} title="Soil cover opportunity" text="A cover crop after sorghum could reduce bare soil exposure through winter." /><Evidence icon={TrendingUp} title="Priority alignment" text="This pathway scores highest against your water conservation and drought resilience priorities." /></div></Card>}</>; }
function StrategyCard({ name, tag, score, description, color, crops, benefits, risks, onCompare }: { name: string; tag: string; score: number; description: string; color: string; crops: string[]; benefits: string[]; risks: string[]; onCompare: () => void }) { return <Card className={`strategy-card ${color}`}><div className="strategy-top"><span className="strategy-tag">{tag}</span><div className="strategy-score"><strong>{score}</strong><small>/100</small></div></div><h2>{name}</h2><p>{description}</p><div className="crop-sequence">{crops.map((crop, index) => <div key={crop}><span>{index + 1}</span><strong>{crop}</strong>{index < crops.length - 1 && <ChevronRight size={13} />}</div>)}</div><div className="benefit-risk"><div><span className="section-label"><Check size={13} /> BENEFITS</span>{benefits.map((benefit) => <p key={benefit}>{benefit}</p>)}</div><div><span className="section-label risk"><Zap size={13} /> WATCH OUT</span>{risks.map((risk) => <p key={risk}>{risk}</p>)}</div></div><button className="outline-button full" onClick={onCompare}>Compare strategy <ArrowLeft size={14} className="flip" /></button></Card>; }
function Evidence({ icon: Icon, title, text }: { icon: typeof Droplets; title: string; text: string }) { return <div className="evidence-row"><div className="evidence-icon"><Icon size={17} /></div><div><strong>{title}</strong><p>{text}</p></div><ChevronRight size={16} /></div>; }

function ScenarioSimulator({ notify }: { notify: (message: string) => void }) { const [rain, setRain] = useState(-10); const [temp, setTemp] = useState(2); const [ran, setRan] = useState(false); return <><PageTitle eyebrow="SCENARIO SIMULATOR · HYPOTHETICAL" title="Stress-test your rotation" description="Explore how different climate assumptions could change crop suitability. These are scenarios, not forecasts." action={ran ? 'Run again' : 'Run scenario'} onAction={() => { setRan(true); notify('Hypothetical scenario calculated'); }} /><div className="scenario-layout"><Card className="scenario-controls"><CardHeader title="Climate assumptions" subtitle="Adjust one variable at a time" /><ScenarioSlider label="Rainfall change" value={rain} min={-30} max={20} unit="%" onChange={setRain} color="blue" /><ScenarioSlider label="Temperature increase" value={temp} min={0} max={5} unit="°C" onChange={setTemp} color="orange" /><ScenarioSlider label="Heat exposure" value={temp + 3} min={0} max={15} unit=" days" onChange={() => undefined} color="yellow" /><div className="scenario-help"><CircleHelp size={16} /><span>Try a dry summer scenario to see how the strategies respond.</span></div></Card><div className="scenario-results"><Card className="result-hero"><div><span className="status-badge warning"><span /> HYPOTHETICAL SCENARIO</span><h2>{rain}% rainfall · +{temp}°C temperature</h2><p>Compared with the current Brandenburg baseline.</p></div><div className="scenario-arrow"><ArrowLeft size={22} /></div></Card><div className="result-grid"><Card><CardHeader title="Strategy ranking" subtitle="Suitability under scenario" /><div className="ranking">{[['Water-resilient', 86, '1st'], ['Soil-health focused', 73, '2nd'], ['Existing rotation', 51, '3rd']].map(([name, score, rank]) => <div className="rank-row" key={name as string}><span>{rank}</span><div><strong>{name as string}</strong><i><b style={{ width: `${score}%` }} /></i></div><em>{score}</em></div>)}</div></Card><Card><CardHeader title="Impact indicators" subtitle="Relative to baseline" /><div className="impact-list"><div><Droplets size={16} /><span>Water demand</span><strong className="green-text">−14%</strong></div><div><Thermometer size={16} /><span>Heat exposure</span><strong className="orange-text">+{temp + 3} days</strong></div><div><Leaf size={16} /><span>Soil cover</span><strong className="green-text">+8%</strong></div><div><TrendingUp size={16} /><span>Yield stability</span><strong className="green-text">+11%</strong></div></div></Card></div><Card className="scenario-chart"><CardHeader title="Baseline vs hypothetical rainfall" subtitle="Monthly millimetres · demonstration data" /><DataChart variant="rain" /></Card></div></div></>; }
function ScenarioSlider({ label, value, min, max, unit, onChange, color }: { label: string; value: number; min: number; max: number; unit: string; onChange: (value: number) => void; color: string }) { return <div className="scenario-slider"><div><strong>{label}</strong><output className={color}>{value > 0 ? '+' : ''}{value}{unit}</output></div><input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} /><div className="range-labels"><span>{min}{unit}</span><span>{max > 0 ? '+' : ''}{max}{unit}</span></div></div>; }

function Reports({ notify }: { notify: (message: string) => void }) { const sources = [['NASA POWER', 'Climate observations and solar-derived weather data', 'Modelled · 1° resolution', 'Available'], ['NASA SMAP', 'Global soil moisture active and passive mission', 'Satellite-derived · 9 km', 'Available'], ['NASA GPM', 'Global precipitation measurement mission', 'Satellite-derived · 10 km', 'Available'], ['NASA MODIS', 'Vegetation indices and land surface temperature', 'Satellite-derived · 250 m', 'Available'], ['SoilGrids', 'Global soil property maps', 'Estimated · 250 m', 'Baseline']]; return <><PageTitle eyebrow="REPORTS & EVIDENCE" title="Evidence you can trust" description="Review the sources, model context and limitations behind every recommendation." action="Download report" onAction={() => notify('Report prepared for download')} /><div className="reports-grid"><Card><CardHeader title="Data sources" subtitle="Inputs currently used in this demo" action={<span className="data-badge">5 SOURCES</span>} /><div className="source-table">{sources.map(([name, desc, resolution, status]) => <div className="source-table-row" key={name}><div className="source-icon"><Globe2 size={16} /></div><div><strong>{name}</strong><p>{desc}</p></div><span>{resolution}</span><em><i />{status}</em><ChevronRight size={15} /></div>)}</div></Card><Card className="model-card"><CardHeader title="Model information" action={<BrainCircuit size={18} color="#168653" />} /><div className="model-version"><span>FieldShift Rotation Engine</span><strong>v0.1 · Demo</strong></div><div className="model-details"><div><span>Model type</span><strong>Multi-objective optimiser</strong></div><div><span>Training data</span><strong>Not connected</strong></div><div><span>Prediction uncertainty</span><strong>Moderate</strong></div><div><span>Last updated</span><strong>12 Nov 2025</strong></div></div><div className="limitation"><CircleHelp size={16} /><p><strong>Important limitation</strong> Recommendations are demonstration outputs. Connect validated NASA and farm data before making operational decisions.</p></div></Card><Card className="report-preview"><CardHeader title="Recommendation report" subtitle="Greenfield Farm · generated today" action={<button className="outline-button" onClick={() => notify('Report prepared for download')}><Download size={15} /> PDF</button>} /><div className="report-paper"><div className="paper-header"><div className="brand-mark small"><Leaf size={15} /></div><strong>FieldShift<span>AI</span></strong><span>DECISION BRIEF · DEMO</span></div><h2>Rotation recommendation</h2><p>Water-resilient pathway · Greenfield Farm</p><div className="paper-score"><strong>84</strong><span>overall fit<br /><small>moderate confidence</small></span></div><div className="paper-lines"><i /><i /><i /></div></div></Card></div></>; }

export default App;
