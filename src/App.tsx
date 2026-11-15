import { useCallback, useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { SidebarV2 } from './components/shell/Sidebar';
import { DashboardV2 } from './components/dashboard/Dashboard';
import { FieldExplorerView } from './components/fields/FieldExplorerView';
import { FieldAnalyticsWorkspace } from './components/analytics/FieldAnalyticsWorkspace';
import { WeatherView } from './components/weather/WeatherView';
import { AIAssistantView } from './components/ai-assistant/AIAssistantView';
import { AdvisorDrawer } from './components/advisor/AdvisorDrawer';
import { CropPlannerView } from './components/crop-planner/CropPlannerView';
import { SettingsModal } from './components/common/SettingsModal';
import { useI18n } from './i18n';
import {
  ArrowLeft, Bell, Check, Download, Menu, Plus, Search, Settings, X
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
  const [analyticsFieldId, setAnalyticsFieldId] = useState<string>('');
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
            analyticsFieldId ? (
              <FieldAnalyticsWorkspace
                fieldId={analyticsFieldId}
                onClose={() => navigate('dashboard')}
                notify={notify}
                onSelectField={(id) => setAnalyticsFieldId(id)}
                onNavigate={(p) => navigate(p as PageKey)}
              />
            ) : (
              <div className="card">Resolving a saved field. No default field ID is being queried.</div>
            )
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
          {page === 'rotation-studio' && (
            <CropPlannerView fieldId={analyticsFieldId} onSelectField={(id) => setAnalyticsFieldId(id)} notify={notify} />
          )}
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

function FieldExplorer({ notify, navigate }: { notify: (message: string) => void; navigate: (page: PageKey) => void }) {
  return <FieldExplorerView onNotify={notify} onNavigateDashboard={() => navigate('dashboard')} />;
}

function Environment() {
  const { t } = useI18n();
  return (
    <>
      <PageTitle
        eyebrow={t('environmental.eyebrow')}
        title={t('environmental.title')}
        description={t('environmental.description')}
      />
      <Card>
        <CardHeader title="Environmental profile unavailable" />
        <p className="muted">
          No field-specific environmental response is connected to this page. The former demonstration
          indicators and charts are disabled so they cannot be mistaken for observations.
        </p>
      </Card>
    </>
  );
}
function FarmerProfile({ notify }: { notify: (message: string) => void }) {
  const { t } = useI18n();
  return (
    <>
      <PageTitle
        eyebrow={t('farmerProfile.eyebrow')}
        title={t('farmerProfile.title')}
        description={t('farmerProfile.description')}
        action={t('farmerProfile.saveProfile')}
        onAction={() => notify('Profile persistence is not connected. No profile was saved.')}
      />
      <Card>
        <CardHeader title="Farmer profile unavailable" />
        <p className="muted">
          Saved farm details, crop history, priorities, and constraints are not available from a durable data source.
          The former pre-filled farm, field, and crop records are disabled.
        </p>
      </Card>
    </>
  );
}
function ScenarioSimulator({ notify }: { notify: (message: string) => void }) {
  const { t } = useI18n();
  return (
    <>
      <PageTitle
        eyebrow={t('scenarioSimulator.eyebrow')}
        title={t('scenarioSimulator.title')}
        description={t('scenarioSimulator.description')}
        action={t('scenarioSimulator.runScenario')}
        onAction={() => notify('No calibrated scenario model is connected. No result was generated.')}
      />
      <Card>
        <CardHeader title="Scenario results unavailable" />
        <p className="muted">
          Strategy scores and impact percentages are hidden until a calibrated model can derive them from
          selected assumptions and sourced baseline data.
        </p>
      </Card>
    </>
  );
}
function Reports({ notify }: { notify: (message: string) => void }) {
  const { t } = useI18n();
  return (
    <>
      <PageTitle
        eyebrow={t('reports.eyebrow')}
        title={t('reports.title')}
        description={t('reports.description')}
        action={t('reports.downloadReport')}
        onAction={() => notify('No sourced report is available to download.')}
      />
      <Card>
        <CardHeader title="Recommendation report unavailable" />
        <p className="muted">
          No generated recommendation report is connected to this page. Fixed source statuses, model metadata,
          farm names, and recommendation scores are not shown.
        </p>
      </Card>
    </>
  );
}
export default App;
