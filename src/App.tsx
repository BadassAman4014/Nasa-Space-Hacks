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
import { AdvisorDrawer } from './components/advisor/AdvisorDrawer';
import { SettingsModal } from './components/common/SettingsModal';
import { useI18n } from './i18n';
import {
  Activity, ArrowLeft, BarChart3, Bell, BrainCircuit, Check, ChevronDown, ChevronRight,
  CircleHelp, CloudRain, CloudSun, Compass, Download, Droplets, Eye, FileText, Globe2,
  Layers3, Leaf, Map, MapPin, Menu, MoreHorizontal, Navigation, Plus, Search, Settings,
  ShieldCheck, SlidersHorizontal, Sprout, Sun, Thermometer, TrendingUp, Users, X, Zap
} from 'lucide-react';

export type PageKey =
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

function App() {
  const { t } = useI18n();
  const [page, setPage] = useState<PageKey>(() => (window.location.pathname.slice(1) as PageKey) || 'dashboard');
  const [analyticsFieldId, setAnalyticsFieldId] = useState<string>('field-c6bb6ab214');
  const [mobileNav, setMobileNav] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    async function resolveActiveField() {
      try {
        let resp = await fetch('/api/fields');
        if (!resp.ok) {
          resp = await fetch('http://127.0.0.1:8000/api/fields');
        }
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
      {/* Global Settings Modal with Language & Units */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        notify={notify}
      />

      <SidebarV2 page={page} navigate={navigate} mobileOpen={mobileNav} onClose={() => setMobileNav(false)} notify={notify} />
      <main className="workspace">
        {page !== 'dashboard' && page !== 'fields' && page !== 'analytics' && page !== 'weather' && page !== 'ai-assistant' && (
          <Topbar
            navigate={navigate}
            onMenu={() => setMobileNav(true)}
            onNotify={() => notify(t('common.allCaughtUp'))}
            onOpenSettings={() => setSettingsOpen(true)}
          />
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
              navigate={(p, extra) => navigate(p as PageKey, extra)}
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
      {page !== 'ai-assistant' && <AdvisorDrawer onOpenFields={() => navigate('fields')} />}
      {toast && (
        <div className="toast" role="alert" aria-live="polite">
          <div className="toast-icon">
            {toast.toLowerCase().includes('caught up') || toast.toLowerCase().includes('neuesten stand') ? (
              <Bell size={16} strokeWidth={2.5} />
            ) : (
              <Check size={16} strokeWidth={2.5} />
            )}
          </div>
          <div className="toast-body">
            <span className="toast-title">
              {toast.toLowerCase().includes('caught up') || toast.toLowerCase().includes('neuesten stand')
                ? t('common.notification')
                : t('common.update')}
            </span>
            <span className="toast-msg">{toast}</span>
          </div>
          <button
            type="button"
            className="toast-close"
            onClick={() => setToast(null)}
            title={t('common.dismiss')}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function Topbar({
  navigate,
  onMenu,
  onNotify,
  onOpenSettings,
}: {
  navigate: (page: PageKey) => void;
  onMenu: () => void;
  onNotify: () => void;
  onOpenSettings?: () => void;
}) {
  const { t } = useI18n();
  return (
    <header className="topbar">
      <button className="menu-button" onClick={onMenu} aria-label="Toggle menu">
        <Menu size={20} />
      </button>
      <button className="back-button" onClick={() => navigate('dashboard')}>
        <ArrowLeft size={16} /> <span>{t('topbar.back')}</span>
      </button>
      <div className="top-search">
        <Search size={16} />
        <input placeholder={t('topbar.searchPlaceholder')} />
        <span className="shortcut">⌘ K</span>
      </div>
      <div className="top-actions flex items-center gap-2">
        <button className="outline-button hide-small" onClick={() => navigate('reports')}>
          <Download size={15} /> {t('topbar.export')}
        </button>
        <button className="icon-button" onClick={onOpenSettings} title={t('settings.title')}>
          <Settings size={18} />
        </button>
        <button className="icon-button" onClick={onNotify} title={t('topbar.notifications')}>
          <Bell size={18} />
          <span className="notification-dot" />
        </button>
        <button className="avatar top-avatar" onClick={onOpenSettings} title="Jonas Schmidt">JS</button>
      </div>
    </header>
  );
}

function PageTitle({ eyebrow, title, description, action, onAction }: { eyebrow: string; title: string; description?: string; action?: string; onAction?: () => void }) {
  return (
    <div className="page-title">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && (
        <button className="primary-button" onClick={onAction}>
          <Plus size={16} /> {action}
        </button>
      )}
    </div>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="card-header">
      <div>
        <h3>{title}</h3>
        {subtitle && <span>{subtitle}</span>}
      </div>
      {action}
    </div>
  );
}

function Metric({ label, value, unit, trend, icon: Icon, tone = 'green' }: { label: string; value: string; unit?: string; trend?: string; icon: typeof Droplets; tone?: string }) {
  return (
    <div className="metric">
      <div className="metric-top">
        <span>{label}</span>
        <span className={`metric-icon ${tone}`}><Icon size={16} /></span>
      </div>
      <div className="metric-value">
        {value}
        <small>{unit}</small>
      </div>
      {trend && (
        <div className="metric-trend">
          <TrendingUp size={13} /> {trend}
        </div>
      )}
    </div>
  );
}

function FieldExplorer({ notify, navigate }: { notify: (message: string) => void; navigate: (page: PageKey) => void }) {
  return <FieldExplorerView onNotify={notify} onNavigateDashboard={() => navigate('dashboard')} />;
}

function Environment() {
  const { t } = useI18n();
  const [tab, setTab] = useState('Overview');
  const tabNames: Record<string, string> = {
    Overview: t('environmental.tabs.overview'),
    Climate: t('environmental.tabs.climate'),
    Soil: t('environmental.tabs.soil'),
    Vegetation: t('environmental.tabs.vegetation'),
    'Detailed data': t('environmental.tabs.detailedData'),
  };

  return (
    <>
      <PageTitle
        eyebrow={t('environmental.eyebrow')}
        title={t('environmental.title')}
        description={t('environmental.description')}
      />
      <div className="tabs">
        {['Overview', 'Climate', 'Soil', 'Vegetation', 'Detailed data'].map((item) => (
          <button className={tab === item ? 'active' : ''} onClick={() => setTab(item)} key={item}>
            {tabNames[item] || item}
          </button>
        ))}
      </div>
      <div className="env-grid">
        <Card>
          <CardHeader
            title={tab === 'Overview' ? t('environmental.keyIndicators') : `${tabNames[tab] || tab} Indicators`}
            subtitle={t('environmental.selectedRegion')}
            action={<span className="data-badge">{t('common.demoData')}</span>}
          />
          <div className="indicator-grid">
            <Indicator label={t('environmental.rainfallAnomaly')} value="−8%" note="vs 10-year average" icon={CloudRain} tone="orange" />
            <Indicator label={t('environmental.soilMoisture')} value="+4%" note="within healthy range" icon={Droplets} />
            <Indicator label={t('environmental.heatExposure')} value="6 days" note="above 30°C this season" icon={Sun} tone="yellow" />
            <Indicator label={t('environmental.vegHealth')} value="0.72" note="NDVI index · healthy" icon={Leaf} />
            <Indicator label={t('environmental.organicCarbon')} value="2.1%" note="estimated · 0–30 cm" icon={Sprout} />
            <Indicator label={t('environmental.soilPh')} value="6.4" note="slightly acidic" icon={Activity} tone="blue" />
          </div>
        </Card>
        <Card className="large-chart-card">
          <CardHeader
            title={tab === 'Vegetation' ? 'NDVI time series' : 'Monthly rainfall & temperature'}
            subtitle="Jan 2024 — Dec 2025"
            action={<button className="select-mini">Last 24 months <ChevronDown size={14} /></button>}
          />
          <DataChart variant={tab === 'Vegetation' ? 'ndvi' : 'rain'} />
        </Card>
        <Card>
          <CardHeader
            title={t('environmental.dataProvenance')}
            subtitle={t('environmental.understandObservations')}
          />
          <div className="provenance-list">
            <DataSource name="NASA POWER" type="Modelled climate" date="12 Nov 2025" />
            <DataSource name="NASA SMAP" type="Satellite-derived" date="10 Nov 2025" />
            <DataSource name="SoilGrids" type="Estimated soil profile" date="2024 baseline" />
          </div>
        </Card>
        <Card>
          <CardHeader
            title={t('environmental.soilComposition')}
            action={
              <button className="text-button">
                {t('environmental.viewDetails')} <ChevronRight size={14} />
              </button>
            }
          />
          <div className="soil-composition">
            <div className="donut">
              <span>{t('environmental.loam')}</span>
              <small>{t('environmental.texture')}</small>
            </div>
            <div className="composition-bars">
              <div><span>{t('environmental.sand')}</span><strong>42%</strong><i style={{ width: '42%' }} /></div>
              <div><span>{t('environmental.silt')}</span><strong>38%</strong><i style={{ width: '38%' }} /></div>
              <div><span>{t('environmental.clay')}</span><strong>20%</strong><i style={{ width: '20%' }} /></div>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}

function Indicator({ label, value, note, icon: Icon, tone = 'green' }: { label: string; value: string; note: string; icon: typeof CloudRain; tone?: string }) {
  return (
    <div className="indicator">
      <div className={`indicator-icon ${tone}`}><Icon size={17} /></div>
      <span>{label}<CircleHelp size={12} /></span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

function DataChart({ variant }: { variant: 'ndvi' | 'rain' }) {
  return (
    <div className="data-chart">
      <div className="legend">
        <span><i className="legend-green" /> {variant === 'ndvi' ? 'NDVI health' : 'Rainfall'}</span>
        <span><i className="legend-orange" /> {variant === 'ndvi' ? 'Historical average' : 'Temperature'}</span>
      </div>
      <svg viewBox="0 0 760 220" preserveAspectRatio="none">
        <g className="svg-grid">
          <path d="M0 40H760M0 90H760M0 140H760M0 190H760" />
        </g>
        <path
          d={variant === 'ndvi'
            ? 'M0 150 C35 165 60 145 90 130 S145 145 180 120 S235 105 270 130 S320 80 360 100 S405 120 440 90 S485 80 520 105 S570 80 610 70 S660 95 700 75 S735 70 760 45'
            : 'M0 145 C40 130 60 90 100 120 S150 160 190 100 S240 135 280 65 S330 110 370 140 S420 120 460 150 S520 170 560 110 S610 85 650 105 S710 50 760 90'}
          fill="none"
          stroke="#168653"
          strokeWidth="3"
        />
        <path
          d="M0 165 C50 150 80 160 120 145 S190 150 230 125 S300 145 350 125 S410 140 460 120 S530 130 580 105 S650 115 700 100 S740 110 760 95"
          fill="none"
          stroke="#F4A340"
          strokeWidth="2"
          strokeDasharray="6 6"
        />
      </svg>
      <div className="months">
        <span>Jan '24</span><span>Apr</span><span>Jul</span><span>Oct</span><span>Jan '25</span><span>Apr</span><span>Jul</span><span>Oct</span>
      </div>
    </div>
  );
}

function DataSource({ name, type, date }: { name: string; type: string; date: string }) {
  return (
    <div className="source-row">
      <div className="source-icon"><Globe2 size={16} /></div>
      <div><strong>{name}</strong><small>{type} · {date}</small></div>
      <Check size={15} color="#168653" />
    </div>
  );
}

function FarmerProfile({ notify }: { notify: (message: string) => void }) {
  const { t } = useI18n();
  const [step, setStep] = useState(1);
  const [saved, setSaved] = useState(false);
  const [priorities, setPriorities] = useState([80, 65, 72, 48, 58, 62, 45]);

  const priorityKeys = [
    t('farmerProfile.prioritiesList.waterConservation'),
    t('farmerProfile.prioritiesList.soilHealth'),
    t('farmerProfile.prioritiesList.droughtResilience'),
    t('farmerProfile.prioritiesList.nitrogenContribution'),
    t('farmerProfile.prioritiesList.erosionReduction'),
    t('farmerProfile.prioritiesList.profitability'),
    t('farmerProfile.prioritiesList.cropDiversity'),
  ];

  const stepsLabels = [
    t('farmerProfile.steps.farmDetails'),
    t('farmerProfile.steps.cropHistory'),
    t('farmerProfile.steps.priorities'),
    t('farmerProfile.steps.constraints'),
  ];

  return (
    <>
      <PageTitle
        eyebrow={t('farmerProfile.eyebrow')}
        title={t('farmerProfile.title')}
        description={t('farmerProfile.description')}
        action={saved ? t('farmerProfile.saved') : t('farmerProfile.saveProfile')}
        onAction={() => {
          setSaved(true);
          notify(t('farmerProfile.profileSavedNotify'));
        }}
      />
      <div className="profile-layout">
        <Card className="step-card">
          <div className="stepper">
            {stepsLabels.map((label, index) => (
              <button
                onClick={() => setStep(index + 1)}
                className={step === index + 1 ? 'active' : step > index + 1 ? 'done' : ''}
                key={label}
              >
                <span>{step > index + 1 ? <Check size={14} /> : index + 1}</span>
                {label}
              </button>
            ))}
          </div>

          <div className="form-content">
            {step === 1 && (
              <>
                <h2>{t('farmerProfile.farmDetailsTitle')}</h2>
                <p className="form-intro">{t('farmerProfile.farmDetailsIntro')}</p>
                <div className="form-grid">
                  <label>
                    {t('farmerProfile.farmNameLabel')}
                    <input defaultValue="Greenfield Farm" />
                  </label>
                  <label>
                    {t('farmerProfile.locationLabel')}
                    <input defaultValue="Potsdam, Brandenburg" />
                  </label>
                  <label>
                    {t('farmerProfile.farmingTypeLabel')}
                    <select defaultValue={t('farmerProfile.farmingTypeConventional')}>
                      <option>{t('farmerProfile.farmingTypeConventional')}</option>
                      <option>{t('farmerProfile.farmingTypeOrganic')}</option>
                      <option>{t('farmerProfile.farmingTypeMixed')}</option>
                    </select>
                  </label>
                  <label>
                    {t('farmerProfile.irrigationLabel')}
                    <select defaultValue={t('farmerProfile.irrigationLimited')}>
                      <option>{t('farmerProfile.irrigationFull')}</option>
                      <option>{t('farmerProfile.irrigationLimited')}</option>
                      <option>{t('farmerProfile.irrigationRainFed')}</option>
                    </select>
                  </label>
                </div>
                <label>
                  {t('farmerProfile.fieldsIncludedLabel')}
                  <div className="choice-row">
                    <button className="choice selected"><Check size={15} /> North block · 32 ha</button>
                    <button className="choice selected"><Check size={15} /> Riverside · 28 ha</button>
                    <button className="choice"><Plus size={15} /> {t('farmerProfile.addAnotherField')}</button>
                  </div>
                </label>
              </>
            )}

            {step === 2 && <CropHistory />}

            {step === 3 && (
              <>
                <h2>{t('farmerProfile.whatMattersMostTitle')}</h2>
                <p className="form-intro">{t('farmerProfile.slidersIntro')}</p>
                <div className="priority-list">
                  {priorityKeys.map((name, index) => (
                    <label key={name}>
                      <div>
                        <strong>{name}</strong>
                        <span>{priorities[index]}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={priorities[index]}
                        onChange={(e) =>
                          setPriorities(priorities.map((val, i) => (i === index ? Number(e.target.value) : val)))
                        }
                      />
                    </label>
                  ))}
                </div>
              </>
            )}

            {step === 4 && (
              <>
                <h2>{t('farmerProfile.constraintsTitle')}</h2>
                <p className="form-intro">{t('farmerProfile.constraintsIntro')}</p>
                <div className="constraint-grid">
                  <label>
                    {t('farmerProfile.equipmentLabel')}
                    <textarea placeholder={t('farmerProfile.equipmentPlaceholder')} />
                  </label>
                  <label>
                    {t('farmerProfile.marketLabel')}
                    <textarea placeholder={t('farmerProfile.marketPlaceholder')} />
                  </label>
                  <label>
                    {t('farmerProfile.livestockLabel')}
                    <textarea placeholder={t('farmerProfile.livestockPlaceholder')} />
                  </label>
                  <label>
                    {t('farmerProfile.fertilizerLabel')}
                    <textarea placeholder={t('farmerProfile.fertilizerPlaceholder')} />
                  </label>
                </div>
              </>
            )}

            <div className="form-actions">
              <button className="outline-button" disabled={step === 1} onClick={() => setStep(step - 1)}>
                {t('common.previous')}
              </button>
              <button
                className="primary-button"
                onClick={() =>
                  step < 4 ? setStep(step + 1) : notify(t('farmerProfile.profileReadyNotify'))
                }
              >
                {step === 4 ? t('farmerProfile.finishProfile') : t('common.continue')} <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </Card>

        <Card className="profile-aside">
          <div className="aside-illustration"><Sprout size={36} /></div>
          <h3>{t('farmerProfile.whyWeAskTitle')}</h3>
          <p>{t('farmerProfile.whyWeAskDesc')}</p>
          <div className="aside-list">
            <div><ShieldCheck size={16} /><span>{t('farmerProfile.privacyNote')}</span></div>
            <div><BrainCircuit size={16} /><span>{t('farmerProfile.explainableNote')}</span></div>
            <div><Eye size={16} /><span>{t('farmerProfile.changeableNote')}</span></div>
          </div>
        </Card>
      </div>
    </>
  );
}

function CropHistory() {
  const { t } = useI18n();
  const crops = [
    t('farmerProfile.crops.winterWheat'),
    t('farmerProfile.crops.fieldPeas'),
    t('farmerProfile.crops.winterBarley'),
    t('farmerProfile.crops.coverCrop'),
    t('farmerProfile.crops.rapeseed'),
    t('farmerProfile.crops.potatoes'),
  ];

  return (
    <>
      <h2>{t('farmerProfile.cropHistoryTitle')}</h2>
      <p className="form-intro">{t('farmerProfile.cropHistoryIntro')}</p>
      <div className="history-list">
        {['2025', '2024', '2023', '2022', '2021'].map((year, index) => (
          <div className="history-row" key={year}>
            <strong>{year}</strong>
            <select defaultValue={crops[index % crops.length]}>
              {crops.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <span className="history-status"><Check size={14} /> {t('farmerProfile.recordedStatus')}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function RotationStudio({ notify }: { notify: (message: string) => void }) {
  const { t } = useI18n();
  const [generated, setGenerated] = useState(false);
  const [active, setActive] = useState('comparison');

  const strategies = [
    {
      name: t('rotationStudio.strategies.existing.name'),
      tag: t('rotationStudio.strategies.existing.tag'),
      score: 62,
      description: t('rotationStudio.strategies.existing.description'),
      color: 'neutral',
      crops: [
        t('farmerProfile.crops.winterWheat'),
        t('farmerProfile.crops.fieldPeas'),
        t('farmerProfile.crops.winterBarley'),
        t('farmerProfile.crops.coverCrop'),
      ],
      benefits: [
        t('rotationStudio.strategies.existing.benefit1'),
        t('rotationStudio.strategies.existing.benefit2'),
      ],
      risks: [t('rotationStudio.strategies.existing.risk1')],
    },
    {
      name: t('rotationStudio.strategies.waterResilient.name'),
      tag: t('rotationStudio.strategies.waterResilient.tag'),
      score: 84,
      description: t('rotationStudio.strategies.waterResilient.description'),
      color: 'green',
      crops: [
        t('farmerProfile.crops.winterWheat'),
        t('farmerProfile.crops.fieldPeas'),
        t('farmerProfile.crops.sorghum'),
        t('farmerProfile.crops.coverCrop'),
      ],
      benefits: [
        t('rotationStudio.strategies.waterResilient.benefit1'),
        t('rotationStudio.strategies.waterResilient.benefit2'),
      ],
      risks: [t('rotationStudio.strategies.waterResilient.risk1')],
    },
    {
      name: t('rotationStudio.strategies.soilHealth.name'),
      tag: t('rotationStudio.strategies.soilHealth.tag'),
      score: 79,
      description: t('rotationStudio.strategies.soilHealth.description'),
      color: 'blue',
      crops: [
        t('farmerProfile.crops.winterBarley'),
        t('farmerProfile.crops.clover'),
        t('farmerProfile.crops.winterWheat'),
        t('farmerProfile.crops.fieldPeas'),
      ],
      benefits: [
        t('rotationStudio.strategies.soilHealth.benefit1'),
        t('rotationStudio.strategies.soilHealth.benefit2'),
      ],
      risks: [t('rotationStudio.strategies.soilHealth.risk1')],
    },
  ];

  return (
    <>
      <PageTitle
        eyebrow={t('rotationStudio.eyebrow')}
        title={t('rotationStudio.title')}
        description={t('rotationStudio.description')}
        action={generated ? t('rotationStudio.regenerate') : t('rotationStudio.generateRecommendations')}
        onAction={() => {
          setGenerated(true);
          notify(t('rotationStudio.threeStrategiesNotify'));
        }}
      />
      <div className="studio-banner">
        <div className="banner-icon"><BrainCircuit size={22} /></div>
        <div>
          <strong>
            {generated
              ? t('rotationStudio.readyToReviewTitle')
              : t('rotationStudio.readyToExploreTitle')}
          </strong>
          <p>
            {generated
              ? t('rotationStudio.readyToReviewDesc')
              : t('rotationStudio.readyToExploreDesc')}
          </p>
        </div>
        <div className="confidence">
          <span>{t('rotationStudio.modelConfidence')}</span>
          <strong>{t('rotationStudio.confidenceModerate')}</strong>
          <small>{t('rotationStudio.basedOnDemo')}</small>
        </div>
      </div>

      <div className="studio-tabs">
        {[
          ['comparison', t('rotationStudio.tabs.strategyComparison')],
          ['timeline', t('rotationStudio.tabs.timeline')],
          ['metrics', t('rotationStudio.tabs.metrics')],
          ['evidence', t('rotationStudio.tabs.evidence')],
        ].map(([id, label]) => (
          <button className={active === id ? 'active' : ''} onClick={() => setActive(id)} key={id}>
            {label}
          </button>
        ))}
      </div>

      {active === 'comparison' && (
        <div className="strategy-grid">
          {strategies.map((strategy) => (
            <StrategyCard
              key={strategy.name}
              {...strategy}
              onCompare={() => notify(t('rotationStudio.strategyAddedNotify', { name: strategy.name }))}
            />
          ))}
        </div>
      )}

      {active === 'timeline' && (
        <Card>
          <CardHeader
            title={t('rotationStudio.fourYearTimelineTitle')}
            subtitle={t('rotationStudio.waterResilientSubtitle')}
          />
          <div className="timeline">
            {['2026', '2027', '2028', '2029'].map((year, index) => (
              <div className="timeline-year" key={year}>
                <span>{year}</span>
                <div className={`crop-tile crop-${index}`}>
                  <Sprout size={22} />
                  <strong>
                    {[
                      t('farmerProfile.crops.winterWheat'),
                      t('farmerProfile.crops.fieldPeas'),
                      t('farmerProfile.crops.sorghum'),
                      t('farmerProfile.crops.coverCrop'),
                    ][index]}
                  </strong>
                  <small>
                    {[
                      'High water efficiency',
                      'Nitrogen fixing',
                      'Drought tolerant',
                      'Soil protection',
                    ][index]}
                  </small>
                </div>
                {index < 3 && <ChevronRight className="timeline-arrow" />}
              </div>
            ))}
          </div>
        </Card>
      )}

      {active === 'metrics' && (
        <Card>
          <CardHeader
            title={t('rotationStudio.metricsTitle')}
            subtitle={t('rotationStudio.metricsSubtitle')}
          />
          <div className="comparison-table">
            {[
              t('rotationStudio.metricsTable.waterDemand'),
              t('rotationStudio.metricsTable.nitrogenContribution'),
              t('rotationStudio.metricsTable.soilCover'),
              t('rotationStudio.metricsTable.cropDiversity'),
              t('rotationStudio.metricsTable.droughtSuitability'),
              t('rotationStudio.metricsTable.marketSuitability'),
            ].map((label, index) => (
              <div className="table-row" key={label}>
                <strong>{label}</strong>
                <span>{[62, 44, 55, 50, 68, 75][index]}</span>
                <i><b style={{ width: `${[62, 44, 55, 50, 68, 75][index]}%` }} /></i>
                <em>{[78, 82, 91, 88, 86, 67][index]}</em>
                <i><b className="orange-bar" style={{ width: `${[78, 82, 91, 88, 86, 67][index]}%` }} /></i>
              </div>
            ))}
          </div>
        </Card>
      )}

      {active === 'evidence' && (
        <Card>
          <CardHeader
            title={t('rotationStudio.evidenceTitle')}
            subtitle={t('rotationStudio.evidenceSubtitle')}
          />
          <div className="evidence-list">
            <Evidence
              icon={Droplets}
              title={t('rotationStudio.evidence1Title')}
              text={t('rotationStudio.evidence1Text')}
            />
            <Evidence
              icon={Leaf}
              title={t('rotationStudio.evidence2Title')}
              text={t('rotationStudio.evidence2Text')}
            />
            <Evidence
              icon={TrendingUp}
              title={t('rotationStudio.evidence3Title')}
              text={t('rotationStudio.evidence3Text')}
            />
          </div>
        </Card>
      )}
    </>
  );
}

function StrategyCard({
  name,
  tag,
  score,
  description,
  color,
  crops,
  benefits,
  risks,
  onCompare,
}: {
  name: string;
  tag: string;
  score: number;
  description: string;
  color: string;
  crops: string[];
  benefits: string[];
  risks: string[];
  onCompare: () => void;
}) {
  const { t } = useI18n();
  return (
    <Card className={`strategy-card ${color}`}>
      <div className="strategy-top">
        <span className="strategy-tag">{tag}</span>
        <div className="strategy-score">
          <strong>{score}</strong>
          <small>/100</small>
        </div>
      </div>
      <h2>{name}</h2>
      <p>{description}</p>
      <div className="crop-sequence">
        {crops.map((crop, index) => (
          <div key={crop}>
            <span>{index + 1}</span>
            <strong>{crop}</strong>
            {index < crops.length - 1 && <ChevronRight size={13} />}
          </div>
        ))}
      </div>
      <div className="benefit-risk">
        <div>
          <span className="section-label">
            <Check size={13} /> {t('rotationStudio.benefitsLabel')}
          </span>
          {benefits.map((b) => (
            <p key={b}>{b}</p>
          ))}
        </div>
        <div>
          <span className="section-label risk">
            <Zap size={13} /> {t('rotationStudio.watchOutLabel')}
          </span>
          {risks.map((r) => (
            <p key={r}>{r}</p>
          ))}
        </div>
      </div>
      <button className="outline-button full" onClick={onCompare}>
        {t('rotationStudio.compareStrategyBtn')} <ArrowLeft size={14} className="flip" />
      </button>
    </Card>
  );
}

function Evidence({ icon: Icon, title, text }: { icon: typeof Droplets; title: string; text: string }) {
  return (
    <div className="evidence-row">
      <div className="evidence-icon"><Icon size={17} /></div>
      <div><strong>{title}</strong><p>{text}</p></div>
      <ChevronRight size={16} />
    </div>
  );
}

function ScenarioSimulator({ notify }: { notify: (message: string) => void }) {
  const { t } = useI18n();
  const [rain, setRain] = useState(-10);
  const [temp, setTemp] = useState(2);
  const [ran, setRan] = useState(false);

  return (
    <>
      <PageTitle
        eyebrow={t('scenarioSimulator.eyebrow')}
        title={t('scenarioSimulator.title')}
        description={t('scenarioSimulator.description')}
        action={ran ? t('scenarioSimulator.runAgain') : t('scenarioSimulator.runScenario')}
        onAction={() => {
          setRan(true);
          notify(t('scenarioSimulator.calculatedNotify'));
        }}
      />
      <div className="scenario-layout">
        <Card className="scenario-controls">
          <CardHeader
            title={t('scenarioSimulator.climateAssumptions')}
            subtitle={t('scenarioSimulator.adjustOneVariable')}
          />
          <ScenarioSlider
            label={t('scenarioSimulator.rainfallChange')}
            value={rain}
            min={-30}
            max={20}
            unit="%"
            onChange={setRain}
            color="blue"
          />
          <ScenarioSlider
            label={t('scenarioSimulator.temperatureIncrease')}
            value={temp}
            min={0}
            max={5}
            unit="°C"
            onChange={setTemp}
            color="orange"
          />
          <ScenarioSlider
            label={t('scenarioSimulator.heatExposure')}
            value={temp + 3}
            min={0}
            max={15}
            unit=" days"
            onChange={() => undefined}
            color="yellow"
          />
          <div className="scenario-help">
            <CircleHelp size={16} />
            <span>{t('scenarioSimulator.scenarioHelp')}</span>
          </div>
        </Card>

        <div className="scenario-results">
          <Card className="result-hero">
            <div>
              <span className="status-badge warning"><span /> {t('scenarioSimulator.hypotheticalBadge')}</span>
              <h2>{rain}% rainfall · +{temp}°C temperature</h2>
              <p>{t('scenarioSimulator.comparedWithBaseline')}</p>
            </div>
            <div className="scenario-arrow"><ArrowLeft size={22} /></div>
          </Card>
          <div className="result-grid">
            <Card>
              <CardHeader
                title={t('scenarioSimulator.strategyRanking')}
                subtitle={t('scenarioSimulator.suitabilityUnderScenario')}
              />
              <div className="ranking">
                {[
                  [t('rotationStudio.strategies.waterResilient.name'), 86, '1st'],
                  [t('rotationStudio.strategies.soilHealth.name'), 73, '2nd'],
                  [t('rotationStudio.strategies.existing.name'), 51, '3rd'],
                ].map(([name, score, rank]) => (
                  <div className="rank-row" key={name as string}>
                    <span>{rank}</span>
                    <div>
                      <strong>{name as string}</strong>
                      <i><b style={{ width: `${score}%` }} /></i>
                    </div>
                    <em>{score}</em>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <CardHeader
                title={t('scenarioSimulator.impactIndicators')}
                subtitle={t('scenarioSimulator.relativeToBaseline')}
              />
              <div className="impact-list">
                <div>
                  <Droplets size={16} />
                  <span>{t('scenarioSimulator.waterDemand')}</span>
                  <strong className="green-text">−14%</strong>
                </div>
                <div>
                  <Thermometer size={16} />
                  <span>{t('scenarioSimulator.heatExposureDays')}</span>
                  <strong className="orange-text">+{temp + 3} days</strong>
                </div>
                <div>
                  <Leaf size={16} />
                  <span>{t('scenarioSimulator.soilCover')}</span>
                  <strong className="green-text">+8%</strong>
                </div>
                <div>
                  <TrendingUp size={16} />
                  <span>{t('scenarioSimulator.yieldStability')}</span>
                  <strong className="green-text">+11%</strong>
                </div>
              </div>
            </Card>
          </div>
          <Card className="scenario-chart">
            <CardHeader
              title={t('scenarioSimulator.chartTitle')}
              subtitle={t('scenarioSimulator.chartSubtitle')}
            />
            <DataChart variant="rain" />
          </Card>
        </div>
      </div>
    </>
  );
}

function ScenarioSlider({ label, value, min, max, unit, onChange, color }: { label: string; value: number; min: number; max: number; unit: string; onChange: (value: number) => void; color: string }) {
  return (
    <div className="scenario-slider">
      <div>
        <strong>{label}</strong>
        <output className={color}>{value > 0 ? '+' : ''}{value}{unit}</output>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <div className="range-labels">
        <span>{min}{unit}</span>
        <span>{max > 0 ? '+' : ''}{max}{unit}</span>
      </div>
    </div>
  );
}

function Reports({ notify }: { notify: (message: string) => void }) {
  const { t } = useI18n();
  const sources = [
    ['NASA POWER', 'Climate observations and solar-derived weather data', 'Modelled · 1° resolution', 'Available'],
    ['NASA SMAP', 'Global soil moisture active and passive mission', 'Satellite-derived · 9 km', 'Available'],
    ['NASA GPM', 'Global precipitation measurement mission', 'Satellite-derived · 10 km', 'Available'],
    ['NASA MODIS', 'Vegetation indices and land surface temperature', 'Satellite-derived · 250 m', 'Available'],
    ['SoilGrids', 'Global soil property maps', 'Estimated · 250 m', 'Baseline'],
  ];

  return (
    <>
      <PageTitle
        eyebrow={t('reports.eyebrow')}
        title={t('reports.title')}
        description={t('reports.description')}
        action={t('reports.downloadReport')}
        onAction={() => notify(t('reports.reportPreparedNotify'))}
      />
      <div className="reports-grid">
        <Card>
          <CardHeader
            title={t('reports.dataSources')}
            subtitle={t('reports.inputsUsedDemo')}
            action={<span className="data-badge">{t('reports.fiveSourcesBadge')}</span>}
          />
          <div className="source-table">
            {sources.map(([name, desc, resolution, status]) => (
              <div className="source-table-row" key={name}>
                <div className="source-icon"><Globe2 size={16} /></div>
                <div><strong>{name}</strong><p>{desc}</p></div>
                <span>{resolution}</span>
                <em><i />{status}</em>
                <ChevronRight size={15} />
              </div>
            ))}
          </div>
        </Card>

        <Card className="model-card">
          <CardHeader title={t('reports.modelInfo')} action={<BrainCircuit size={18} color="#168653" />} />
          <div className="model-version">
            <span>{t('reports.engineName')}</span>
            <strong>{t('reports.engineVersion')}</strong>
          </div>
          <div className="model-details">
            <div>
              <span>{t('reports.modelType')}</span>
              <strong>{t('reports.modelTypeVal')}</strong>
            </div>
            <div>
              <span>{t('reports.trainingData')}</span>
              <strong>{t('reports.trainingDataVal')}</strong>
            </div>
            <div>
              <span>{t('reports.predictionUncertainty')}</span>
              <strong>{t('reports.uncertaintyModerate')}</strong>
            </div>
            <div>
              <span>{t('reports.lastUpdated')}</span>
              <strong>12 Nov 2025</strong>
            </div>
          </div>
          <div className="limitation">
            <CircleHelp size={16} />
            <p>
              <strong>{t('reports.importantLimitation')}</strong> {t('reports.limitationText')}
            </p>
          </div>
        </Card>

        <Card className="report-preview">
          <CardHeader
            title={t('reports.recommendationReport')}
            subtitle={t('reports.generatedToday')}
            action={
              <button className="outline-button" onClick={() => notify(t('reports.reportPreparedNotify'))}>
                <Download size={15} /> {t('reports.pdfBtn')}
              </button>
            }
          />
          <div className="report-paper">
            <div className="paper-header">
              <div className="brand-mark small"><Leaf size={15} /></div>
              <strong>FieldShift<span>AI</span></strong>
              <span>{t('reports.decisionBrief')}</span>
            </div>
            <h2>Rotation recommendation</h2>
            <p>Water-resilient pathway · Greenfield Farm</p>
            <div className="paper-score">
              <strong>84</strong>
              <span>
                {t('reports.overallFit')}<br />
                <small>{t('reports.moderateConfidence')}</small>
              </span>
            </div>
            <div className="paper-lines"><i /><i /><i /></div>
          </div>
        </Card>
      </div>
    </>
  );
}

export default App;
