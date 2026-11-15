import { useEffect, useMemo, useState, useCallback } from 'react';
import L from 'leaflet';
import { CircleMarker, GeoJSON, MapContainer, Marker, ScaleControl, TileLayer, useMap } from 'react-leaflet';
import {
  Bell,
  ChevronDown,
  ChevronRight,
  Map,
  Maximize2,
  MoreVertical,
  Navigation,
  Plus,
  X,
  Sprout,
  Trash2,
  Layers,
  Satellite,
  PanelLeftClose,
  PanelLeftOpen,
  ArrowLeft,
} from 'lucide-react';
import { boundariesApi, type SavedField, type UserFarm } from '../../services/boundariesApi';
import { FieldSoilCard } from './FieldSoilCard';
import { MapSearchBar } from '../common/MapSearchBar';
import { MapLegend } from '../common/MapLegend';
import { useI18n } from '../../i18n';
import { calculateGeometryCentroid, type SearchResult } from '../../services/geocodingService';
import { fetchAllFieldsWeather, fetchFieldWeather, type FieldWeatherData, type FieldWeatherSummary } from '../../services/weatherApi';
import { createVirtualStationDivIcon } from '../weather/VirtualWeatherStationMarker';
import { environmentApi } from '../../services/environmentApi';
import { fieldHealthApi } from '../../services/fieldHealthApi';

type PageKey =
  | 'dashboard'
  | 'fields'
  | 'analytics'
  | 'weather'
  | 'rotation-studio';

export function DashboardV2(props: {
  navigate: (p: PageKey, extraFieldId?: string) => void;
  notify: (s: string) => void;
  onMenu: () => void;
  selectedFieldId?: string | null;
  selectedLocationLabel?: string;
  onSelectField?: (id: string | null) => void;
}) {
  const { t } = useI18n();
  const [farms, setFarms] = useState<UserFarm[]>([]);
  const [fields, setFields] = useState<SavedField[]>([]);
  const [selectedFarmId, setSelectedFarmId] = useState<string>('all');
  const selectedFieldId = props.selectedFieldId || null;
  const [farmMenuOpen, setFarmMenuOpen] = useState(false);
  const [panelView, setPanelView] = useState<'list' | 'summary'>('list');
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [mobileSheetSnap, setMobileSheetSnap] = useState<'peek' | 'half' | 'full'>('half');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [weatherSummaries, setWeatherSummaries] = useState<FieldWeatherSummary[]>([]);

  const setSelectedFieldId = useCallback((id: string | null) => {
    props.onSelectField?.(id);
  }, [props.onSelectField]);

  // Edit / Delete modals
  const [editModalField, setEditModalField] = useState<SavedField | null>(null);
  const [editName, setEditName] = useState('');
  const [editCrop, setEditCrop] = useState('');
  const [editFarmId, setEditFarmId] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [deleteConfirmField, setDeleteConfirmField] = useState<SavedField | null>(null);
  const [deleteConfirmFarm, setDeleteConfirmFarm] = useState<UserFarm | null>(null);
  const [manageFarmsModalOpen, setManageFarmsModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Load farms and fields from persistent backend SQLite storage
  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [farmsData, fieldsData, weatherData] = await Promise.all([
        boundariesApi.listFarms(),
        boundariesApi.listFields(selectedFarmId !== 'all' ? selectedFarmId : undefined),
        fetchAllFieldsWeather().catch(() => []),
      ]);
      setFarms(farmsData || []);
      setFields(fieldsData || []);
      setWeatherSummaries(weatherData || []);
      if (fieldsData && fieldsData.length > 0 && !fieldsData.some((field) => field.id === selectedFieldId)) {
        setSelectedFieldId(fieldsData[0].id);
      } else if ((!fieldsData || fieldsData.length === 0) && selectedFieldId) {
        setSelectedFieldId(null);
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      setLoadError(err instanceof Error ? err.message : 'Dashboard data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [selectedFarmId, setSelectedFieldId, selectedFieldId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Selected farm object
  const activeFarm = useMemo(() => {
    if (selectedFarmId === 'all') return null;
    return farms.find((f) => f.id === selectedFarmId) || null;
  }, [farms, selectedFarmId]);

  // Total area calculation
  const totalAreaHa = useMemo(() => {
    return fields.reduce((sum, f) => sum + (f.area_hectares || 0), 0);
  }, [fields]);

  const selectedField = fields.find((field) => field.id === selectedFieldId) || null;

  // Open edit modal
  const handleOpenEdit = (field: SavedField) => {
    setEditModalField(field);
    setEditName(field.name);
    setEditCrop(field.current_crop || '');
    setEditFarmId(field.farm_id);
  };

  // Submit field edit
  const handleSaveEdit = async () => {
    if (!editModalField || !editName.trim()) return;
    setSavingEdit(true);
    try {
      await boundariesApi.updateField(editModalField.id, {
        name: editName.trim(),
        current_crop: editCrop.trim(),
        farm_id: editFarmId || editModalField.farm_id,
      });
      props.notify(t('dashboard.updateSuccess', { name: editName }));
      setEditModalField(null);
      await loadData();
    } catch (err: any) {
      props.notify(t('dashboard.updateError', { error: err?.message || String(err) }));
    } finally {
      setSavingEdit(false);
    }
  };

  // Delete field
  const handleDeleteField = async () => {
    if (!deleteConfirmField) return;
    setDeleting(true);
    try {
      await boundariesApi.deleteField(deleteConfirmField.id);
      props.notify(t('dashboard.deleteFieldSuccess', { name: deleteConfirmField.name }));
      if (selectedFieldId === deleteConfirmField.id) {
        setSelectedFieldId(null);
      }
      setDeleteConfirmField(null);
      await loadData();
    } catch (err: any) {
      props.notify(t('dashboard.deleteFieldError', { error: err?.message || String(err) }));
    } finally {
      setDeleting(false);
    }
  };

  // Delete farm and all associated fields
  const handleDeleteFarm = async () => {
    if (!deleteConfirmFarm) return;
    setDeleting(true);
    try {
      await boundariesApi.deleteFarm(deleteConfirmFarm.id);
      props.notify(t('dashboard.deleteFarmSuccess', { name: deleteConfirmFarm.name }));
      if (selectedFarmId === deleteConfirmFarm.id) {
        setSelectedFarmId('all');
      }
      setSelectedFieldId(null);
      setDeleteConfirmFarm(null);
      setManageFarmsModalOpen(false);
      await loadData();
    } catch (err: any) {
      props.notify(t('dashboard.deleteFarmError', { error: err?.message || String(err) }));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="dashboard-grid">
      <section
        className={`dash-panel dash-panel--mobile-${mobileSheetSnap} ${panelCollapsed ? 'dash-panel--collapsed' : ''}`}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
      >
        <button className="dash-sheet-handle" onClick={() => setMobileSheetSnap((value) => value === 'peek' ? 'half' : value === 'half' ? 'full' : 'peek')} aria-label="Change panel height"><span /></button>
        <div className="dash-panel-pinned">
          <button className="dash-panel-collapse" onClick={() => setPanelCollapsed((value) => !value)} title={panelCollapsed ? t('fieldAnalytics.dashboardPanel.expand') : t('fieldAnalytics.dashboardPanel.collapse')} aria-label={panelCollapsed ? t('fieldAnalytics.dashboardPanel.expand') : t('fieldAnalytics.dashboardPanel.collapse')}>
            {panelCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          {!panelCollapsed && <>
            <PropertyHeader
              activeFarm={activeFarm}
              farms={farms}
              selectedFarmId={selectedFarmId}
              onSelectFarm={(farmId) => { setSelectedFarmId(farmId); setFarmMenuOpen(false); setPanelView('list'); }}
              farmMenuOpen={farmMenuOpen}
              setFarmMenuOpen={setFarmMenuOpen}
              totalAreaHa={totalAreaHa}
              locationLabel={props.selectedLocationLabel}
              onAddField={() => props.navigate('fields')}
              onOpenDeleteFarm={(farm) => setDeleteConfirmFarm(farm)}
              onOpenManageFarms={() => setManageFarmsModalOpen(true)}
            />
            <FieldWeatherChip field={selectedField || fields[0] || null} onOpenWeather={() => props.navigate('weather')} />
          </>}
        </div>

        {!panelCollapsed && <div className="dash-panel-body">
          {loading ? <DashboardPanelSkeleton /> : loadError ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p>{loadError}</p><button onClick={() => loadData()} className="mt-3 font-bold underline">Retry</button></div> : fields.length === 0 ? <EmptyDashboardState onAddField={() => props.navigate('fields')} /> : panelView === 'list' ? (
            <SavedFieldsList
              fields={fields}
              selectedFieldId={selectedFieldId}
              onSelectField={(id) => { setSelectedFieldId(id); setPanelView('summary'); }}
              onAddField={() => props.navigate('fields')}
            />
          ) : selectedField ? (
            <DashboardFieldSummary
              field={selectedField}
              onBack={() => setPanelView('list')}
              onOpenAnalytics={() => props.navigate('analytics', selectedField.id)}
              onViewProfile={() => { sessionStorage.setItem('farmily_analytics_tab', 'health'); props.navigate('analytics', selectedField.id); }}
              onViewWaterData={() => { sessionStorage.setItem('farmily_analytics_tab', 'water'); props.navigate('analytics', selectedField.id); }}
              notify={props.notify}
            />
          ) : null}
        </div>}
      </section>

      {/* Right Leaflet Map Stage */}
      <MapViewV2
        fields={fields}
        farms={farms}
        weatherSummaries={weatherSummaries}
        selectedFieldId={selectedFieldId}
        setSelectedFieldId={setSelectedFieldId}
        navigate={props.navigate}
        notify={props.notify}
        onMenu={props.onMenu}
        panelCollapsed={panelCollapsed}
        onFieldOpen={() => { setPanelView('summary'); setPanelCollapsed(false); }}
      />

      {/* Edit Field Modal */}
      {editModalField && (
        <div className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#242424] border border-[#3a3a3a] rounded-2xl w-full max-w-md p-6 shadow-2xl text-white">
            <h3 className="text-base font-bold mb-1">{t('dashboard.editTitle')}</h3>
            <p className="text-xs text-[#aaa] mb-4">
              {t('dashboard.editDesc')}
            </p>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-medium text-[#bbb] mb-1.5">
                  {t('dashboard.fieldNameLabel')}
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-[#1a1a1a] border border-[#3a3a3a] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#1fa35b]"
                  placeholder={t('dashboard.fieldNamePlaceholder')}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#bbb] mb-1.5">
                  {t('dashboard.currentCropLabel')}
                </label>
                <input
                  type="text"
                  value={editCrop}
                  onChange={(e) => setEditCrop(e.target.value)}
                  className="w-full bg-[#1a1a1a] border border-[#3a3a3a] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#1fa35b]"
                  placeholder={t('dashboard.currentCropPlaceholder')}
                />
              </div>

              {farms.length > 1 && (
                <div>
                  <label className="block text-xs font-medium text-[#bbb] mb-1.5">
                    {t('dashboard.assignedFarmLabel')}
                  </label>
                  <select
                    value={editFarmId}
                    onChange={(e) => setEditFarmId(e.target.value)}
                    className="w-full bg-[#1a1a1a] border border-[#3a3a3a] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#1fa35b]"
                  >
                    {farms.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.location})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditModalField(null)}
                className="px-4 py-2 rounded-lg bg-[#333] hover:bg-[#444] text-xs font-medium text-[#ccc]"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={savingEdit || !editName.trim()}
                className="px-5 py-2 rounded-lg bg-[#1fa35b] hover:bg-[#188a4c] font-semibold text-xs text-white disabled:opacity-50"
              >
                {savingEdit ? t('dashboard.savingBtn') : t('dashboard.saveChangesBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmField && (
        <div className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#242424] border border-[#3a3a3a] rounded-2xl w-full max-w-sm p-6 shadow-2xl text-white">
            <h3 className="text-base font-bold text-red-400 mb-1">{t('dashboard.deleteFieldTitle')}</h3>
            <p className="text-xs text-[#aaa] mb-4">
              {t('dashboard.deleteFieldConfirm', {
                name: deleteConfirmField.name,
                area: deleteConfirmField.area_hectares.toFixed(2),
              })}
            </p>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmField(null)}
                className="px-4 py-2 rounded-lg bg-[#333] hover:bg-[#444] text-xs font-medium text-[#ccc]"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleDeleteField}
                disabled={deleting}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 font-semibold text-xs text-white disabled:opacity-50"
              >
                {deleting ? t('dashboard.deletingBtn') : t('dashboard.confirmDeleteBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Farm Confirmation Modal */}
      {deleteConfirmFarm && (
        <div className="fixed inset-0 z-[1100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#242424] border border-[#3a3a3a] rounded-2xl w-full max-w-sm p-6 shadow-2xl text-white">
            <div className="flex items-center gap-2.5 text-red-400 mb-2">
              <div className="w-8 h-8 rounded-xl bg-red-500/20 flex items-center justify-center">
                <Trash2 size={16} />
              </div>
              <h3 className="text-base font-bold">{t('dashboard.deleteFarmTitle')}</h3>
            </div>
            <p className="text-xs text-[#aaa] mb-3 leading-relaxed">
              {t('dashboard.deleteFarmConfirm', { name: deleteConfirmFarm.name })}
            </p>
            <div className="p-3 bg-red-950/30 border border-red-800/40 rounded-xl text-[11px] text-red-300 mb-4">
              <strong>{t('common.error')}:</strong>{' '}
              {t('dashboard.deleteFarmWarning', {
                count: deleteConfirmFarm.field_count,
                area: deleteConfirmFarm.total_area_ha.toFixed(1),
              })}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmFarm(null)}
                className="px-4 py-2 rounded-lg bg-[#333] hover:bg-[#444] text-xs font-medium text-[#ccc]"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleDeleteFarm}
                disabled={deleting}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 font-semibold text-xs text-white flex items-center gap-1.5 disabled:opacity-50"
              >
                <Trash2 size={13} />
                <span>{deleting ? t('dashboard.deletingBtn') : t('dashboard.deleteFarmAction')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage & Delete Farms Modal */}
      {manageFarmsModalOpen && (
        <div className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#242424] border border-[#3a3a3a] rounded-2xl w-full max-w-md p-6 shadow-2xl text-white space-y-4">
            <div className="flex items-center justify-between border-b border-[#333] pb-3">
              <div className="flex items-center gap-2">
                <Layers size={18} className="text-[#1fa35b]" />
                <h3 className="text-base font-bold text-white">{t('dashboard.manageFarmsTitle')}</h3>
              </div>
              <button
                onClick={() => setManageFarmsModalOpen(false)}
                className="p-1 rounded-md text-[#888] hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-[#aaa]">
              {t('dashboard.manageFarmsDesc')}
            </p>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {farms.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-[#1c1c1c] border border-[#2e2e2e]"
                >
                  <div>
                    <strong className="text-xs text-white block">{f.name}</strong>
                    <span className="text-[11px] text-[#888]">
                      {t('dashboard.fieldsAndArea', {
                        count: f.field_count,
                        area: f.total_area_ha.toFixed(1),
                      })}
                      {f.location ? ` · ${f.location}` : ''}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setManageFarmsModalOpen(false);
                      setDeleteConfirmFarm(f);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-400 hover:text-red-300 border border-red-800/40 text-xs font-semibold flex items-center gap-1 transition"
                  >
                    <Trash2 size={12} />
                    <span>{t('common.delete')}</span>
                  </button>
                </div>
              ))}
              {farms.length === 0 && (
                <div className="text-center py-6 text-xs text-[#888]">
                  {t('dashboard.noUserFarms')}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-[#333]">
              <button
                type="button"
                onClick={() => setManageFarmsModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-[#333] hover:bg-[#444] text-xs font-medium text-white"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Subcomponents
// ----------------------------------------------------------------------------

function PanelHeader({
  onAddField,
  onNotify,
  farms,
  activeFarm,
  onOpenDeleteFarm,
  onOpenManageFarms,
}: {
  onAddField: () => void;
  onNotify?: (msg: string) => void;
  farms: UserFarm[];
  activeFarm: UserFarm | null;
  onOpenDeleteFarm: (farm: UserFarm) => void;
  onOpenManageFarms: () => void;
}) {
  const { t } = useI18n();
  const [hasUnread, setHasUnread] = useState(true);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  return (
    <div className="dash-head relative">
      {/* LEFT: Add Field button & Overflow menu */}
      <div className="dash-head-left relative">
        <button onClick={onAddField} className="dash-add-btn" title={t('dashboard.addField')}>
          <Plus size={16} /> <span>{t('dashboard.addField')}</span>
        </button>
        <button
          onClick={() => setMoreMenuOpen(!moreMenuOpen)}
          className={`dash-more ${moreMenuOpen ? 'bg-gray-100 ring-2 ring-[#1fa35b]' : ''}`}
          title={t('dashboard.moreOptions')}
          aria-label={t('dashboard.moreOptions')}
        >
          <MoreVertical size={18} />
        </button>

        {/* 3-Dot Options Dropdown */}
        {moreMenuOpen && (
          <div className="absolute top-12 left-0 z-50 w-60 bg-white border border-gray-200 rounded-2xl shadow-xl p-1.5 text-xs text-gray-800 space-y-0.5 animate-in fade-in slide-in-from-top-1">
            {activeFarm && (
              <button
                type="button"
                onClick={() => {
                  setMoreMenuOpen(false);
                  onOpenDeleteFarm(activeFarm);
                }}
                className="w-full text-left px-3 py-2 rounded-xl text-red-600 hover:bg-red-50 font-semibold flex items-center gap-2 transition"
              >
                <Trash2 size={14} className="text-red-500" />
                <span className="truncate">{t('dashboard.deleteFarmOption', { name: activeFarm.name })}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setMoreMenuOpen(false);
                onOpenManageFarms();
              }}
              className="w-full text-left px-3 py-2 rounded-xl hover:bg-gray-100 font-medium flex items-center gap-2 text-red-600 transition"
            >
              <Trash2 size={14} className="text-red-500" />
              <span>{t('dashboard.deleteAFarmOption')}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMoreMenuOpen(false);
                onOpenManageFarms();
              }}
              className="w-full text-left px-3 py-2 rounded-xl hover:bg-gray-100 font-medium flex items-center gap-2 text-gray-700 transition"
            >
              <Layers size={14} className="text-emerald-600" />
              <span>{t('dashboard.manageFarms')} ({farms.length})</span>
            </button>

            <div className="border-t border-gray-100 my-1" />

            <button
              type="button"
              onClick={() => {
                setMoreMenuOpen(false);
                onAddField();
              }}
              className="w-full text-left px-3 py-2 rounded-xl hover:bg-gray-100 font-medium flex items-center gap-2 text-gray-700 transition"
            >
              <Plus size={14} className="text-gray-500" />
              <span>{t('dashboard.addNewFieldOption')}</span>
            </button>
          </div>
        )}
      </div>

      {/* RIGHT: Notifications button */}
      <div className="dash-head-right flex items-center gap-2">
        {onNotify && (
          <button
            className="dash-bell-btn"
            onClick={() => {
              setHasUnread(false);
              onNotify(t('common.allCaughtUp'));
            }}
            title={t('dashboard.notificationsBtn')}
          >
            <Bell size={18} />
            {hasUnread && <i className="dash-notification-dot" />}
          </button>
        )}
      </div>
    </div>
  );
}

function PropertyHeader({
  activeFarm,
  farms,
  selectedFarmId,
  onSelectFarm,
  farmMenuOpen,
  setFarmMenuOpen,
  totalAreaHa,
  locationLabel,
  onAddField,
  onOpenDeleteFarm,
  onOpenManageFarms,
}: {
  activeFarm: UserFarm | null;
  farms: UserFarm[];
  selectedFarmId: string;
  onSelectFarm: (id: string) => void;
  farmMenuOpen: boolean;
  setFarmMenuOpen: (v: boolean) => void;
  totalAreaHa: number;
  locationLabel?: string;
  onAddField: () => void;
  onOpenDeleteFarm: (farm: UserFarm) => void;
  onOpenManageFarms: () => void;
}) {
  const { t, formatHectares } = useI18n();
  const farmDisplayName = activeFarm ? activeFarm.name : farms.length > 0 ? t('dashboard.allFarms') : t('dashboard.myFarms');
  const locationText = locationLabel || activeFarm?.location || '';

  return (
    <section className="card-v2 property">
      <div className="flex items-center gap-1.5 relative">
        <button
          className="property-name"
          onClick={() => setFarmMenuOpen(!farmMenuOpen)}
        >
          <span>{farmDisplayName}</span>
          <ChevronDown size={16} />
        </button>
        <button className="property-map" onClick={onAddField} title="Discover fields in Field Explorer">
          <Map size={15} />
        </button>

        {farmMenuOpen && (
          <div className="farm-menu v2-menu absolute top-10 left-0">
            <button
              onClick={() => onSelectFarm('all')}
              className={selectedFarmId === 'all' ? 'font-bold text-[#1fa35b]' : ''}
            >
              {t('dashboard.allFarms')} ({farms.length})
            </button>
            {farms.map((f) => (
              <div key={f.id} className="flex items-center justify-between w-full hover:bg-gray-50 rounded-lg pr-1">
                <button
                  onClick={() => onSelectFarm(f.id)}
                  className={`flex-1 text-left ${selectedFarmId === f.id ? 'font-bold text-[#1fa35b]' : ''}`}
                >
                  {f.name} ({f.field_count} fields · {f.total_area_ha} ha)
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFarmMenuOpen(false);
                    onOpenDeleteFarm(f);
                  }}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition"
                  title={`Delete farm "${f.name}"`}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <button
              onClick={() => {
                setFarmMenuOpen(false);
                onOpenManageFarms();
              }}
              className="text-red-600 hover:text-red-700 font-semibold border-t border-gray-100 mt-1 pt-1.5 flex items-center gap-1.5 text-xs w-full text-left"
            >
              <Trash2 size={13} /> {t('dashboard.deleteAFarmOption')}
            </button>
            <button
              onClick={onAddField}
              className="text-[#1fa35b] font-semibold border-t border-gray-100 mt-1 pt-1 flex items-center gap-1.5 text-xs w-full text-left"
            >
              <Plus size={14} /> + {t('dashboard.addNewFieldOption')}
            </button>
          </div>
        )}
      </div>

      <strong>{totalAreaHa > 0 ? formatHectares(totalAreaHa) : '0 ha'}</strong>
      <p>{locationText}</p>
      <span>{t('dashboard.totalArea')}</span>
    </section>
  );
}

function EmptyDashboardState({ onAddField }: { onAddField: () => void }) {
  const { t } = useI18n();
  return (
    <div className="card-v2 text-center p-8 flex flex-col items-center justify-center gap-3">
      <div className="w-12 h-12 rounded-2xl bg-[#1fa35b]/10 text-[#1fa35b] flex items-center justify-center">
        <Sprout size={28} />
      </div>
      <div>
        <h3 className="text-base font-bold text-[#1b1b1b]">{t('dashboard.noSavedFieldsTitle')}</h3>
        <p className="text-xs text-[#6f6f6f] max-w-xs mt-1">
          {t('dashboard.noSavedFieldsDesc')}
        </p>
      </div>
      <button
        onClick={onAddField}
        className="mt-2 px-5 py-2.5 rounded-xl bg-[#1fa35b] hover:bg-[#188a4c] font-semibold text-xs text-white shadow-md flex items-center gap-1.5 cursor-pointer"
      >
        <Plus size={16} /> {t('dashboard.addFirstField')}
      </button>
    </div>
  );
}

function SavedFieldsList({
  fields,
  selectedFieldId,
  onSelectField,
  onAddField,
}: {
  fields: SavedField[];
  selectedFieldId: string | null;
  onSelectField: (id: string) => void;
  onAddField: () => void;
}) {
  const { t, formatHectares } = useI18n();
  return (
    <section className="dashboard-fields-card card-v2 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-[#111827] flex items-center gap-1.5">
          <Sprout size={16} className="text-[#1fa35b]" /> {t('dashboard.yourFarmFields')} ({fields.length})
        </h3>
        <button
          onClick={onAddField}
          className="text-xs text-[#1fa35b] font-semibold hover:underline flex items-center gap-1"
        >
          <Plus size={13} /> {t('dashboard.addShort')}
        </button>
      </div>

      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
        {fields.map((f) => {
          const isSelected = f.id === selectedFieldId;
          return (
            <div
              key={f.id}
              onClick={() => onSelectField(f.id)}
              className={`p-3 rounded-2xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                isSelected
                  ? 'bg-[#eef9f2] border-[#b8e6ca]'
                  : 'bg-white hover:bg-[#f8f9fa] border-[#ebebeb]'
              }`}
            >
              <div className="min-w-0">
                <div className="text-xs font-bold text-[#111827] truncate">{f.name}</div>
                <div className="text-[11px] text-[#6b7280] flex items-center gap-2 mt-0.5">
                  <span>{formatHectares(f.area_hectares)}</span>
                  {f.current_crop ? (
                    <>
                      <span>•</span>
                      <span className="text-[#1fa35b] font-medium truncate">{f.current_crop}</span>
                    </>
                  ) : (
                    <>
                      <span>•</span>
                      <span className="text-[#888] italic truncate">{t('dashboard.noCropAssigned')}</span>
                    </>
                  )}
                  {f.farm_name && (
                    <>
                      <span>•</span>
                      <span className="text-[#999] truncate">{f.farm_name}</span>
                    </>
                  )}
                </div>
              </div>

              <ChevronRight
                size={16}
                className={isSelected ? 'shrink-0 text-[#1fa35b]' : 'shrink-0 text-[#9ca3af]'}
                aria-hidden="true"
              />
            </div>
          );
        })}
      </div>

    </section>
  );
}

function DashboardPanelSkeleton() {
  const { t } = useI18n();
  return <div className="space-y-3" aria-label={t('fieldAnalytics.dashboardPanel.loadingFields')}>{[0, 1, 2].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}</div>;
}

function DashboardFieldSummary({ field, onBack, onOpenAnalytics, onViewProfile, onViewWaterData, notify }: { field: SavedField; onBack: () => void; onOpenAnalytics: () => void; onViewProfile: () => void; onViewWaterData: () => void; notify: (message: string) => void }) {
  const { formatHectares, t } = useI18n();
  return (
    <section className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-slate-700 hover:text-emerald-700"><ArrowLeft size={17} />{t('dashboard.yourFarmFields')}</button>
      <div><h2 className="text-xl font-extrabold text-slate-950">{field.name}</h2><p className="mt-1 text-sm text-slate-600">{formatHectares(field.area_hectares)} · {field.current_crop || t('dashboard.noCropAssigned')}</p></div>
      <DashboardWaterSummary fieldId={field.id} onOpen={onViewWaterData} />
      <FieldSoilCard fieldId={field.id} fieldName={field.name} fieldAreaHa={field.area_hectares} notify={notify} variant="compact" onOpenAnalytics={onOpenAnalytics} onViewProfile={onViewProfile} />
    </section>
  );
}

function DashboardWaterSummary({ fieldId, onOpen }: { fieldId: string; onOpen: () => void }) {
  const { formatNumber } = useI18n();
  const [summary, setSummary] = useState<{ rain: number | null; status: string | null } | null>(null);
  useEffect(() => {
    let active = true;
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 90);
    Promise.all([
      environmentApi.getFieldEnvironmental(fieldId, { start_date: start.toISOString().slice(0, 10), end_date: end.toISOString().slice(0, 10) }),
      fieldHealthApi.getTrend(fieldId),
    ]).then(([data, trend]) => {
      if (!active) return;
      const rain = data.gpm?.observations.reduce((total, item) => total + Math.max(0, item.mean_value), 0) ?? null;
      const smap = data.smap?.observations;
      const latest = smap?.[smap.length - 1]?.mean_value;
      const normal = trend.moisture_trend.available ? trend.moisture_trend.usual_range : null;
      const status = typeof latest === 'number' && normal ? latest < normal.p10 ? 'Dry' : latest > normal.p90 ? 'Wet' : 'OK' : null;
      setSummary({ rain: typeof rain === 'number' && data.gpm?.observations.length ? rain : null, status });
    }).catch(() => active && setSummary({ rain: null, status: null }));
    return () => { active = false; };
  }, [fieldId]);
  return <section className="rounded-xl border border-sky-100 bg-sky-50/60 p-3">
    <div className="grid grid-cols-2 gap-2"><div className="rounded-lg bg-white p-2.5"><span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">Rain · 90 days</span><strong className="mt-1 block text-base text-slate-950">{summary?.rain != null ? `${formatNumber(summary.rain, { maximumFractionDigits: 1 })} mm` : '—'}</strong></div><div className="rounded-lg bg-white p-2.5"><span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">Soil water</span><strong className="mt-1 block text-base text-slate-950">{summary?.status || 'No reading'}</strong></div></div>
    <button onClick={onOpen} className="mt-2 w-full text-left text-xs font-extrabold text-emerald-800 underline underline-offset-2">View water data →</button>
  </section>;
}

function FieldWeatherChip({ field, onOpenWeather }: { field: SavedField | null; onOpenWeather: () => void }) {
  const { formatNumber, t } = useI18n();
  const [weather, setWeather] = useState<FieldWeatherData | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!field) return;
    let active = true;
    setWeather(null);
    setFailed(false);
    fetchFieldWeather(field.id).then((result) => active && setWeather(result)).catch(() => active && setFailed(true));
    return () => { active = false; };
  }, [field]);
  if (!field) return null;
  return (
    <button onClick={onOpenWeather} className="mt-2 flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left hover:border-emerald-300" aria-label={t('fieldAnalytics.dashboardPanel.weatherAt', { field: field.name })}>
      <span className="min-w-0"><span className="block truncate text-xs font-bold text-slate-800">{t('fieldAnalytics.dashboardPanel.weatherAt', { field: field.name })}</span><span className="block truncate text-[11px] text-slate-500">{failed ? t('fieldAnalytics.dashboardPanel.unavailable') : weather ? weather.current.condition : t('fieldAnalytics.dashboardPanel.loading')}</span></span>
      <span className="shrink-0 text-right"><span className="block text-sm font-extrabold text-slate-950">{weather ? `${formatNumber(weather.current.temperature_c, { maximumFractionDigits: 0 })}°C` : '—'}</span><span className="text-[10px] font-bold text-emerald-700">{t('dashboard.forecastBtn')} →</span></span>
    </button>
  );
}

// ----------------------------------------------------------------------------
// Leaflet Map Stage for Dashboard (MapViewV2)
// ----------------------------------------------------------------------------

function MapResizer() {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);

    const container = map.getContainer();
    if (!container) return () => clearTimeout(timer);

    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(container);

    return () => {
      clearTimeout(timer);
      ro.disconnect();
    };
  }, [map]);
  return null;
}

export function MapViewV2({
  fields,
  farms = [],
  weatherSummaries = [],
  selectedFieldId,
  setSelectedFieldId,
  navigate,
  notify,
  onMenu,
  panelCollapsed = false,
  onFieldOpen,
  floatingChrome = true,
}: {
  fields: SavedField[];
  farms?: UserFarm[];
  weatherSummaries?: FieldWeatherSummary[];
  selectedFieldId: string | null;
  setSelectedFieldId: (v: string) => void;
  navigate: (p: PageKey) => void;
  notify: (s: string) => void;
  onMenu?: () => void;
  panelCollapsed?: boolean;
  onFieldOpen?: () => void;
  floatingChrome?: boolean;
}) {
  const { t, formatHectares } = useI18n();
  const [map, setMap] = useState<L.Map | null>(null);

  // User exact location GPS state
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number; accuracy?: number } | null>(null);
  const [locating, setLocating] = useState(false);

  const selected = useMemo(() => {
    if (!selectedFieldId) return null;
    return fields.find((field) => field.id === selectedFieldId) || null;
  }, [fields, selectedFieldId]);
  const initialMapCenter = useMemo<[number, number]>(
    () => calculateGeometryCentroid(selected?.geometry || fields[0]?.geometry) || [52.4125, 12.5316],
    [fields, selected]
  );
  const desktopLeftPadding = typeof window !== 'undefined'
    ? window.innerWidth >= 1200
      ? (panelCollapsed ? 230 : 590)
      : (panelCollapsed ? 100 : 470)
    : 590;

  // Handle search selection prioritizing saved fields and farms
  const handleSearchResult = useCallback(
    (result: SearchResult) => {
      if (result.category === 'field' && result.fieldId) {
        setSelectedFieldId(result.fieldId);
        onFieldOpen?.();
        if (result.bounds && map) {
          const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 851;
          map.fitBounds(result.bounds, {
            paddingTopLeft: isDesktop ? [desktopLeftPadding, 60] : [60, 60],
            paddingBottomRight: [60, 60],
            maxZoom: 16.5,
          });
        } else if (result.lat && result.lon && map) {
          map.flyTo([result.lat, result.lon], 15);
        }
        notify(`Selected saved field: ${result.title}`);
      } else if (result.category === 'farm' && result.farmId) {
        if (result.bounds && map) {
          map.fitBounds(result.bounds, { padding: [60, 60] });
        }
        notify(`Filtered to farm: ${result.title}`);
      } else if (result.lat !== undefined && result.lon !== undefined && map) {
        map.flyTo([result.lat, result.lon], 14);
        notify(`Navigated to ${result.title}`);
      }
    },
    [map, setSelectedFieldId, notify]
  );

  // Locate user position via browser geolocation
  const handleLocateMe = useCallback(() => {
    if (!navigator.geolocation) {
      notify(t('dashboard.geoNotSupported'));
      return;
    }
    setLocating(true);
    notify(t('dashboard.locatingGps'));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const accuracy = pos.coords.accuracy;
        setUserLocation({ lat, lon, accuracy });
        setLocating(false);
        if (map) {
          map.flyTo([lat, lon], 14.5, { duration: 1.2 });
        }
        notify(t('dashboard.locatedSuccess', { coords: `${lat.toFixed(4)}, ${lon.toFixed(4)}` }));
      },
      (err) => {
        setLocating(false);
        notify(t('dashboard.geoError', { error: err.message }));
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [map, notify, t]);

  // Fit bounds to selected field or all fields
  useEffect(() => {
    if (!map || !selected) return;
    try {
      const geoLayer = L.geoJSON(selected.geometry as any);
      const b = geoLayer.getBounds();
      if (b.isValid()) {
        const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 851;
        map.flyToBounds(b, {
          paddingTopLeft: isDesktop ? [desktopLeftPadding, 60] : [40, 40],
          paddingBottomRight: [60, 60],
          maxZoom: 16.5,
          duration: 0.8,
        });
      }
    } catch (e) {
      // fallback
    }
  }, [map, selected]);

  return (
    <section className="map-stage">
      <MapContainer
        ref={setMap}
        center={initialMapCenter}
        zoom={fields.length > 0 ? 12 : 8.5}
        zoomSnap={0.5}
        minZoom={8}
        maxZoom={18}
        zoomControl={false}
        attributionControl={false}
        className="leaflet-map"
      >
        <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
        <MapResizer />

        {/* Render real saved fields on satellite map with standard visual conventions:
            - Saved field: Green outline (#1fa35b)
            - Selected field: Orange outline (#ff7a1a) */}
        {fields.map((f) => {
          const isSelected = f.id === selected?.id;
          return (
            <GeoJSON
              key={`${f.id}-${isSelected}`}
              data={f.geometry as any}
              style={{
                color: isSelected ? '#ff7a1a' : '#1fa35b',
                weight: isSelected ? 3.5 : 2.5,
                fillColor: isSelected ? '#ff7a1a' : '#1fa35b',
                fillOpacity: isSelected ? 0.45 : 0.22,
              }}
              eventHandlers={{
                click: () => {
                  setSelectedFieldId(f.id);
        onFieldOpen?.();
                },
              }}
            />
          );
        })}

        {/* Virtual Weather Station Markers (OneSoil style) */}
        {weatherSummaries.map((station) => (
          <Marker
            key={`dashboard-station-${station.field_id}`}
            position={station.coordinates}
            icon={createVirtualStationDivIcon(station, station.field_id === selectedFieldId)}
            eventHandlers={{
              click: () => {
                setSelectedFieldId(station.field_id);
        onFieldOpen?.();
              },
            }}
          />
        ))}

        {/* Current user location: Blue marker (independent of fields) */}
        {userLocation && (
          <>
            <CircleMarker
              center={[userLocation.lat, userLocation.lon]}
              radius={14}
              pathOptions={{
                color: '#3b82f6',
                fillColor: '#3b82f6',
                fillOpacity: 0.25,
                weight: 2,
              }}
            />
            <CircleMarker
              center={[userLocation.lat, userLocation.lon]}
              radius={7}
              pathOptions={{
                color: '#ffffff',
                fillColor: '#2563eb',
                fillOpacity: 1,
                weight: 2.5,
              }}
            />
          </>
        )}

        <ScaleControl position="bottomleft" imperial={false} />
      </MapContainer>

      {/* Map Selection Legend */}
      <MapLegend
        mode="dashboard"
        hasSavedFields={fields.length > 0}
        hasSelectedField={!!selected}
        hasUserLocation={!!userLocation}
      />

      {/* Top Floating Bar: Unified Search */}
      {floatingChrome && (
        <div className="map-topbar">
          {onMenu && (
            <button className="map-menu-btn" onClick={onMenu}>
              ☰
            </button>
          )}
          <MapSearchBar
            mode="dashboard"
            placeholder="Search your field"
            savedFields={fields}
            savedFarms={farms}
            onSelectResult={handleSearchResult}
            className="flex-1 max-w-[500px]"
          />
        </div>
      )}

      {/* Empty State Overlay Prompt on Map if 0 fields */}
      {fields.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[450] p-4">
          <div className="bg-[#1f1f1f]/95 backdrop-blur-md px-6 py-5 rounded-2xl border border-[#333] shadow-2xl text-center pointer-events-auto max-w-sm text-white">
            <div className="w-12 h-12 rounded-2xl bg-[#1fa35b]/20 text-[#1fa35b] flex items-center justify-center mx-auto mb-3">
              <Sprout size={28} />
            </div>
            <h3 className="text-base font-bold mb-1">{t('dashboard.noFieldsOnMapTitle')}</h3>
            <p className="text-xs text-[#aaa] mb-4">
              {t('dashboard.noFieldsOnMapDesc')}
            </p>
            <button
              onClick={() => navigate('fields')}
              className="px-5 py-2.5 rounded-xl bg-[#1fa35b] hover:bg-[#188a4c] font-semibold text-xs text-white shadow-lg flex items-center justify-center gap-1.5 mx-auto cursor-pointer"
            >
              <Plus size={16} /> {t('dashboard.addFirstField')}
            </button>
          </div>
        </div>
      )}

      {/* Map Floating Controls */}
      <div className="map-controls">
        <button
          onClick={() =>
            document.fullscreenElement
              ? document.exitFullscreen()
              : document.querySelector('.map-stage')?.requestFullscreen()
          }
        >
          <Maximize2 />
        </button>
        <div>
          <button onClick={() => map?.zoomIn()}>
            <Plus />
          </button>
          <button onClick={() => map?.zoomOut()}>−</button>
        </div>
        <button
          onClick={handleLocateMe}
          title={locating ? 'Locating...' : 'Locate my position on map (GPS)'}
        >
          <Navigation className={userLocation ? 'text-[#3b82f6]' : ''} />
        </button>
      </div>

      <div className="map-attribution">© Esri, Maxar, Earthstar Geographics</div>
    </section>
  );
}
