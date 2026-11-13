import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import { CircleMarker, GeoJSON, MapContainer, Marker, ScaleControl, TileLayer, useMap } from 'react-leaflet';
import {
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudRain,
  CloudSun,
  Compass,
  Droplets,
  Download,
  Layers3,
  Map,
  Maximize2,
  MoreVertical,
  Navigation,
  Plus,
  Search,
  Star,
  Sun,
  Thermometer,
  TrendingUp,
  X,
  Sprout,
  Pencil,
  Trash2,
  Sparkles,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowRight,
  FlaskConical,
  Satellite,
} from 'lucide-react';
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import { boundariesApi, type SavedField, type UserFarm } from '../../services/boundariesApi';
import { FieldSoilCard } from './FieldSoilCard';
import { FieldEnvironmentalCard } from './FieldEnvironmentalCard';
import { MapSearchBar } from '../common/MapSearchBar';
import { MapLegend } from '../common/MapLegend';
import type { SearchResult } from '../../services/geocodingService';
import { fetchAllFieldsWeather, type FieldWeatherSummary } from '../../services/weatherApi';
import { createVirtualStationDivIcon } from '../weather/VirtualWeatherStationMarker';

export type LayerState = {
  ndvi: boolean;
  moisture: boolean;
  rainfall: boolean;
  temperature: boolean;
  [key: string]: boolean;
};

type PageKey =
  | 'dashboard'
  | 'fields'
  | 'analytics'
  | 'weather'
  | 'environment'
  | 'farmer-profile'
  | 'rotation-studio'
  | 'scenario-simulator'
  | 'reports';

const BRANDENBURG_CENTER: [number, number] = [52.415, 13.045];

export function DashboardV2(props: {
  navigate: (p: PageKey, extraFieldId?: string) => void;
  notify: (s: string) => void;
  onMenu: () => void;
  selectedFieldId?: string | null;
  onSelectField?: (id: string) => void;
}) {
  const [farms, setFarms] = useState<UserFarm[]>([]);
  const [fields, setFields] = useState<SavedField[]>([]);
  const [selectedFarmId, setSelectedFarmId] = useState<string>('all');
  const [selectedFieldId, setSelectedFieldIdState] = useState<string | null>(props.selectedFieldId || null);
  const [farmMenuOpen, setFarmMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [weatherSummaries, setWeatherSummaries] = useState<FieldWeatherSummary[]>([]);

  const setSelectedFieldId = useCallback((id: string | null) => {
    setSelectedFieldIdState(id);
    if (id) {
      props.onSelectField?.(id);
    }
  }, [props.onSelectField]);

  useEffect(() => {
    if (props.selectedFieldId && props.selectedFieldId !== selectedFieldId) {
      setSelectedFieldIdState(props.selectedFieldId);
    }
  }, [props.selectedFieldId]);

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
    try {
      const [farmsData, fieldsData, weatherData] = await Promise.all([
        boundariesApi.listFarms(),
        boundariesApi.listFields(selectedFarmId !== 'all' ? selectedFarmId : undefined),
        fetchAllFieldsWeather().catch(() => []),
      ]);
      setFarms(farmsData || []);
      setFields(fieldsData || []);
      setWeatherSummaries(weatherData || []);
      if (fieldsData && fieldsData.length > 0 && !selectedFieldId) {
        const initialId = props.selectedFieldId && fieldsData.some(f => f.id === props.selectedFieldId)
          ? props.selectedFieldId
          : fieldsData[0].id;
        setSelectedFieldId(initialId);
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedFarmId, props.selectedFieldId, setSelectedFieldId, selectedFieldId]);

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
      props.notify(`Field "${editName}" updated successfully.`);
      setEditModalField(null);
      await loadData();
    } catch (err) {
      props.notify(`Failed to update field: ${err}`);
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
      props.notify(`Field "${deleteConfirmField.name}" deleted from your farm.`);
      if (selectedFieldId === deleteConfirmField.id) {
        setSelectedFieldId(null);
      }
      setDeleteConfirmField(null);
      await loadData();
    } catch (err) {
      props.notify(`Failed to delete field: ${err}`);
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
      props.notify(`Farm "${deleteConfirmFarm.name}" and all associated fields were deleted.`);
      if (selectedFarmId === deleteConfirmFarm.id) {
        setSelectedFarmId('all');
      }
      setSelectedFieldId(null);
      setDeleteConfirmFarm(null);
      setManageFarmsModalOpen(false);
      await loadData();
    } catch (err) {
      props.notify(`Failed to delete farm: ${err}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="dashboard-grid">
      {/* Left Data & Metrics Panel */}
      <section className="dash-panel">
        <PanelHeader
          onAddField={() => props.navigate('fields')}
          onExport={() => props.navigate('reports')}
          onNotify={props.notify}
          farms={farms}
          activeFarm={activeFarm}
          onOpenDeleteFarm={(farm) => setDeleteConfirmFarm(farm)}
          onOpenManageFarms={() => setManageFarmsModalOpen(true)}
        />

        <PropertyHeader
          activeFarm={activeFarm}
          farms={farms}
          selectedFarmId={selectedFarmId}
          onSelectFarm={(fid) => {
            setSelectedFarmId(fid);
            setFarmMenuOpen(false);
          }}
          farmMenuOpen={farmMenuOpen}
          setFarmMenuOpen={setFarmMenuOpen}
          totalAreaHa={totalAreaHa}
          onAddField={() => props.navigate('fields')}
          onOpenDeleteFarm={(farm) => setDeleteConfirmFarm(farm)}
          onOpenManageFarms={() => setManageFarmsModalOpen(true)}
        />

        {/* Empty State when user has 0 saved fields */}
        {fields.length === 0 ? (
          <EmptyDashboardState onAddField={() => props.navigate('fields')} />
        ) : (
          <>
            <SavedFieldsOverview fields={fields} totalAreaHa={totalAreaHa} />
            <SavedFieldsList
              fields={fields}
              selectedFieldId={selectedFieldId}
              onSelectField={(id) => setSelectedFieldId(id)}
              onEdit={handleOpenEdit}
              onDelete={(field) => setDeleteConfirmField(field)}
              onAddField={() => props.navigate('fields')}
              onOpenAnalytics={(fid) => props.navigate('analytics', fid)}
            />
            <RegionalConditions />
          </>
        )}
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
        onEdit={handleOpenEdit}
        onDelete={(field) => setDeleteConfirmField(field)}
        onOpenAnalytics={(fid) => props.navigate('analytics', fid)}
      />

      {/* Edit Field Modal */}
      {editModalField && (
        <div className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#242424] border border-[#3a3a3a] rounded-2xl w-full max-w-md p-6 shadow-2xl text-white">
            <h3 className="text-base font-bold mb-1">Edit Saved Field</h3>
            <p className="text-xs text-[#aaa] mb-4">
              Update field name, crop, or farm assignment.
            </p>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-medium text-[#bbb] mb-1.5">
                  Field Name *
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-[#1a1a1a] border border-[#3a3a3a] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#1fa35b]"
                  placeholder="Field name"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#bbb] mb-1.5">
                  Current Crop (Optional)
                </label>
                <input
                  type="text"
                  value={editCrop}
                  onChange={(e) => setEditCrop(e.target.value)}
                  className="w-full bg-[#1a1a1a] border border-[#3a3a3a] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#1fa35b]"
                  placeholder="e.g. Winter wheat, Field peas, Cover crop"
                />
              </div>

              {farms.length > 1 && (
                <div>
                  <label className="block text-xs font-medium text-[#bbb] mb-1.5">
                    Assigned Farm
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
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={savingEdit || !editName.trim()}
                className="px-5 py-2 rounded-lg bg-[#1fa35b] hover:bg-[#188a4c] font-semibold text-xs text-white disabled:opacity-50"
              >
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmField && (
        <div className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#242424] border border-[#3a3a3a] rounded-2xl w-full max-w-sm p-6 shadow-2xl text-white">
            <h3 className="text-base font-bold text-red-400 mb-1">Delete Saved Field</h3>
            <p className="text-xs text-[#aaa] mb-4">
              Are you sure you want to remove <strong>"{deleteConfirmField.name}"</strong> (
              {deleteConfirmField.area_hectares.toFixed(2)} ha) from your farm? This does not affect
              the official DFBK reference boundary.
            </p>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmField(null)}
                className="px-4 py-2 rounded-lg bg-[#333] hover:bg-[#444] text-xs font-medium text-[#ccc]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteField}
                disabled={deleting}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 font-semibold text-xs text-white disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Confirm Delete'}
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
              <h3 className="text-base font-bold">Delete Farm</h3>
            </div>
            <p className="text-xs text-[#aaa] mb-3 leading-relaxed">
              Are you sure you want to permanently delete <strong>"{deleteConfirmFarm.name}"</strong>?
            </p>
            <div className="p-3 bg-red-950/30 border border-red-800/40 rounded-xl text-[11px] text-red-300 mb-4">
              <strong>Warning:</strong> This will also remove all <strong>{deleteConfirmFarm.field_count} fields</strong> ({deleteConfirmFarm.total_area_ha.toFixed(1)} ha) belonging to this farm from your records.
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmFarm(null)}
                className="px-4 py-2 rounded-lg bg-[#333] hover:bg-[#444] text-xs font-medium text-[#ccc]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteFarm}
                disabled={deleting}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 font-semibold text-xs text-white flex items-center gap-1.5 disabled:opacity-50"
              >
                <Trash2 size={13} />
                <span>{deleting ? 'Deleting...' : 'Delete Farm & Fields'}</span>
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
                <h3 className="text-base font-bold text-white">Manage & Delete Farms</h3>
              </div>
              <button
                onClick={() => setManageFarmsModalOpen(false)}
                className="p-1 rounded-md text-[#888] hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-[#aaa]">
              Review your saved farms. You can permanently delete any farm along with all its saved fields.
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
                      {f.field_count} fields · {f.total_area_ha.toFixed(1)} ha
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
                    <span>Delete</span>
                  </button>
                </div>
              ))}
              {farms.length === 0 && (
                <div className="text-center py-6 text-xs text-[#888]">
                  No user farms found.
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-[#333]">
              <button
                type="button"
                onClick={() => setManageFarmsModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-[#333] hover:bg-[#444] text-xs font-medium text-white"
              >
                Close
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
  onExport,
  onNotify,
  farms,
  activeFarm,
  onOpenDeleteFarm,
  onOpenManageFarms,
}: {
  onAddField: () => void;
  onExport?: () => void;
  onNotify?: (msg: string) => void;
  farms: UserFarm[];
  activeFarm: UserFarm | null;
  onOpenDeleteFarm: (farm: UserFarm) => void;
  onOpenManageFarms: () => void;
}) {
  const [hasUnread, setHasUnread] = useState(true);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  return (
    <div className="dash-head relative">
      {/* LEFT: Add Field button & Overflow menu */}
      <div className="dash-head-left relative">
        <button onClick={onAddField} className="dash-add-btn" title="Add new field">
          <Plus size={16} /> <span>Add Field</span>
        </button>
        <button
          onClick={() => setMoreMenuOpen(!moreMenuOpen)}
          className={`dash-more ${moreMenuOpen ? 'bg-gray-100 ring-2 ring-[#1fa35b]' : ''}`}
          title="More options"
          aria-label="More options"
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
                <span className="truncate">Delete Farm "{activeFarm.name}"</span>
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
              <span>Delete a Farm...</span>
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
              <span>Manage Farms ({farms.length})</span>
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
              <span>Add New Field</span>
            </button>
          </div>
        )}
      </div>

      {/* RIGHT: Export button & Notifications button */}
      <div className="dash-head-right">
        {onExport && (
          <button className="dash-export-btn" onClick={onExport} title="Export reports & evidence">
            <Download size={14} /> <span>Export</span>
          </button>
        )}
        {onNotify && (
          <button
            className="dash-bell-btn"
            onClick={() => {
              setHasUnread(false);
              onNotify('You are all caught up');
            }}
            title="Notifications"
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
  onAddField: () => void;
  onOpenDeleteFarm: (farm: UserFarm) => void;
  onOpenManageFarms: () => void;
}) {
  const farmDisplayName = activeFarm ? activeFarm.name : farms.length > 0 ? 'All farms' : 'My Farms';
  const locationText = activeFarm ? activeFarm.location : 'Brandenburg, Germany';

  return (
    <section className="card-v2 property">
      <div>
        <button
          className="property-name"
          onClick={() => setFarmMenuOpen(!farmMenuOpen)}
        >
          {farmDisplayName}
          <ChevronDown size={16} />
        </button>
        <button className="property-map" onClick={onAddField} title="Discover fields in Field Explorer">
          <Map size={16} />
        </button>

        {farmMenuOpen && (
          <div className="farm-menu v2-menu">
            <button
              onClick={() => onSelectFarm('all')}
              className={selectedFarmId === 'all' ? 'font-bold text-[#1fa35b]' : ''}
            >
              All Farms ({farms.length})
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
              <Trash2 size={13} /> Delete a Farm...
            </button>
            <button
              onClick={onAddField}
              className="text-[#1fa35b] font-semibold border-t border-gray-100 mt-1 pt-1 flex items-center gap-1.5 text-xs w-full text-left"
            >
              <Plus size={14} /> + Add New Field
            </button>
          </div>
        )}
      </div>

      <strong>{totalAreaHa > 0 ? `${totalAreaHa.toFixed(1)} ha` : '0 ha'}</strong>
      <p>{locationText}</p>
      <span>
        <TrendingUp size={15} /> Verified Records
      </span>
    </section>
  );
}

function EmptyDashboardState({ onAddField }: { onAddField: () => void }) {
  return (
    <div className="card-v2 text-center p-8 flex flex-col items-center justify-center gap-3">
      <div className="w-12 h-12 rounded-2xl bg-[#1fa35b]/10 text-[#1fa35b] flex items-center justify-center">
        <Sprout size={28} />
      </div>
      <div>
        <h3 className="text-base font-bold text-[#1b1b1b]">No Saved Fields Yet</h3>
        <p className="text-xs text-[#6f6f6f] max-w-xs mt-1">
          Explore official Brandenburg DFBK agricultural boundaries or draw custom fields to add them to your farm records.
        </p>
      </div>
      <button
        onClick={onAddField}
        className="mt-2 px-5 py-2.5 rounded-xl bg-[#1fa35b] hover:bg-[#188a4c] font-semibold text-xs text-white shadow-md flex items-center gap-1.5"
      >
        <Plus size={16} /> Add Your First Field
      </button>
    </div>
  );
}

function SavedFieldsOverview({
  fields,
  totalAreaHa,
}: {
  fields: SavedField[];
  totalAreaHa: number;
}) {
  const crops = useMemo(() => {
    const set = new Set(fields.map((f) => f.current_crop).filter(Boolean));
    return set.size;
  }, [fields]);

  const avgSize = fields.length > 0 ? (totalAreaHa / fields.length).toFixed(1) : '0';

  return (
    <section className="card-v2 metrics-card">
      <div className="metrics-v2">
        <div className="metric-v2">
          <div>
            <span>Saved Fields</span>
            <Layers size={18} />
          </div>
          <main>
            <strong>{fields.length}</strong>
            <dl>
              <div>
                <dt>Status</dt>
                <dd>{fields.length > 0 ? 'Verified' : 'Empty'}</dd>
              </div>
            </dl>
          </main>
        </div>

        <div className="metric-v2">
          <div>
            <span>Total Area</span>
            <Map size={18} />
          </div>
          <main>
            <strong>
              {totalAreaHa.toFixed(1)}
              <small>ha</small>
            </strong>
            <dl>
              <div>
                <dt>Average</dt>
                <dd>{avgSize} ha</dd>
              </div>
            </dl>
          </main>
        </div>

        <div className="metric-v2">
          <div>
            <span>Crops</span>
            <Sprout size={18} />
          </div>
          <main>
            <strong>{crops || '—'}</strong>
            <dl>
              <div>
                <dt>Types</dt>
                <dd>{crops > 0 ? `${crops} active` : 'None'}</dd>
              </div>
            </dl>
          </main>
        </div>

        <div className="metric-v2">
          <div>
            <span>DFBK Status</span>
            <CheckCircle2 size={18} />
          </div>
          <main>
            <strong>100%</strong>
            <dl>
              <div>
                <dt>Sync</dt>
                <dd>Durable</dd>
              </div>
            </dl>
          </main>
        </div>
      </div>
    </section>
  );
}

function SavedFieldsList({
  fields,
  selectedFieldId,
  onSelectField,
  onEdit,
  onDelete,
  onAddField,
  onOpenAnalytics,
}: {
  fields: SavedField[];
  selectedFieldId: string | null;
  onSelectField: (id: string) => void;
  onEdit: (f: SavedField) => void;
  onDelete: (f: SavedField) => void;
  onAddField: () => void;
  onOpenAnalytics?: (fieldId: string) => void;
}) {
  return (
    <section className="card-v2 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-[#1b1b1b] flex items-center gap-1.5">
          <Sprout size={16} className="text-[#1fa35b]" /> Your Farm Fields ({fields.length})
        </h3>
        <button
          onClick={onAddField}
          className="text-xs text-[#1fa35b] font-semibold hover:underline flex items-center gap-1"
        >
          <Plus size={13} /> Add
        </button>
      </div>

      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {fields.map((f) => {
          const isSelected = f.id === selectedFieldId;
          return (
            <div
              key={f.id}
              onClick={() => onSelectField(f.id)}
              className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                isSelected
                  ? 'bg-[#1fa35b]/10 border-[#1fa35b]'
                  : 'bg-white hover:bg-[#f3f3f3] border-[#e6e6e6]'
              }`}
            >
              <div className="min-w-0">
                <div className="text-xs font-bold text-[#1b1b1b] truncate">{f.name}</div>
                <div className="text-[11px] text-[#6f6f6f] flex items-center gap-2 mt-0.5">
                  <span>{f.area_hectares.toFixed(2)} ha</span>
                  {f.current_crop && (
                    <>
                      <span>•</span>
                      <span className="text-[#1fa35b] font-medium truncate">{f.current_crop}</span>
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

              <div className="flex items-center gap-1">
                {onOpenAnalytics && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenAnalytics(f.id);
                    }}
                    className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition"
                    title="Open Field Analytics Workspace"
                  >
                    <Sparkles size={13} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(f);
                  }}
                  className="p-1.5 rounded-lg hover:bg-black/5 text-[#888] hover:text-[#1b1b1b]"
                  title="Rename or update field"
                >
                  <Pencil size={13} />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(f);
                  }}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-[#888] hover:text-red-600"
                  title="Delete field"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RegionalConditions() {
  return (
    <section className="card-v2 weather-v2 p-4">
      <label className="text-xs font-bold text-[#1b1b1b] block mb-2">Regional Climate & Weather</label>
      <header className="flex items-center gap-3">
        <Cloud size={32} className="text-[#4a8fcc]" />
        <strong className="text-2xl font-bold text-[#1b1b1b]">18.4°C</strong>
        <span className="text-xs text-[#6f6f6f]">
          Potsdam, Brandenburg
          <br />
          Season baseline
        </span>
        <button className="text-xs bg-white border border-[#e3e3e3] px-2.5 py-1 rounded-lg">
          <CloudSun size={15} /> Forecast
        </button>
      </header>
    </section>
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
  onEdit,
  onDelete,
  onOpenAnalytics,
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
  onEdit: (f: SavedField) => void;
  onDelete: (f: SavedField) => void;
  onOpenAnalytics?: (fieldId: string) => void;
  floatingChrome?: boolean;
}) {
  const [map, setMap] = useState<L.Map | null>(null);
  const [cardOpen, setCardOpen] = useState(true);
  const [fieldCardTab, setFieldCardTab] = useState<'soil' | 'nasa' | 'details'>('soil');
  const [layersOpen, setLayersOpen] = useState(false);
  const [layers, setLayers] = useState<LayerState>({
    ndvi: true,
    moisture: false,
    rainfall: false,
    temperature: false,
  });

  // User exact location GPS state
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number; accuracy?: number } | null>(null);
  const [locating, setLocating] = useState(false);

  const selected = useMemo(() => {
    if (!fields.length) return null;
    return fields.find((f) => f.id === selectedFieldId) || fields[0];
  }, [fields, selectedFieldId]);

  // Handle search selection prioritizing saved fields and farms
  const handleSearchResult = useCallback(
    (result: SearchResult) => {
      if (result.category === 'field' && result.fieldId) {
        setSelectedFieldId(result.fieldId);
        setCardOpen(true);
        if (result.bounds && map) {
          map.fitBounds(result.bounds, { padding: [60, 60], maxZoom: 16.5 });
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
      notify('Geolocation is not supported by your browser.');
      return;
    }
    setLocating(true);
    notify('Requesting your GPS location...');
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
        notify(`Located your position: ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
      },
      (err) => {
        setLocating(false);
        notify(`Could not get location: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [map, notify]);

  // Fit bounds to selected field or all fields
  useEffect(() => {
    if (!map || !selected) return;
    try {
      const geoLayer = L.geoJSON(selected.geometry as any);
      const b = geoLayer.getBounds();
      if (b.isValid()) {
        map.flyToBounds(b, {
          paddingTopLeft: [40, 100],
          paddingBottomRight: [380, 60],
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
        center={BRANDENBURG_CENTER}
        zoom={12}
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
                  setCardOpen(true);
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
                setCardOpen(true);
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
            <h3 className="text-base font-bold mb-1">No Saved Fields on Map</h3>
            <p className="text-xs text-[#aaa] mb-4">
              Explore official Brandenburg agricultural boundaries (DFBK) and save them to your farm to view them here.
            </p>
            <button
              onClick={() => navigate('fields')}
              className="px-5 py-2.5 rounded-xl bg-[#1fa35b] hover:bg-[#188a4c] font-semibold text-xs text-white shadow-lg flex items-center justify-center gap-1.5 mx-auto"
            >
              <Plus size={16} /> Add Your First Field
            </button>
          </div>
        </div>
      )}

      {/* Selected Field Card */}
      {selected && cardOpen && (
        <aside className="field-card">
          <header>
            <div>
              <h2>{selected.name}</h2>
              <p>
                {selected.farm_name || 'Farm'} · {selected.current_crop || 'No crop set'}
              </p>
            </div>
            <button onClick={() => setCardOpen(false)}>
              <X size={18} />
            </button>
          </header>

          {/* Segmented Control Tabs */}
          <div className="flex bg-[#f3f4f6] p-1 rounded-xl my-2.5 gap-1">
            <button
              type="button"
              onClick={() => setFieldCardTab('soil')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-1 ${
                fieldCardTab === 'soil'
                  ? 'bg-white shadow-xs text-[#1fa35b]'
                  : 'text-[#6b7280] hover:text-[#111]'
              }`}
            >
              <FlaskConical size={13} /> SoilGrids
            </button>
            <button
              type="button"
              onClick={() => setFieldCardTab('nasa')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-1 ${
                fieldCardTab === 'nasa'
                  ? 'bg-white shadow-xs text-[#0284c7]'
                  : 'text-[#6b7280] hover:text-[#111]'
              }`}
            >
              <Satellite size={13} /> NASA Satellites
            </button>
            <button
              type="button"
              onClick={() => setFieldCardTab('details')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-1 ${
                fieldCardTab === 'details'
                  ? 'bg-white shadow-xs text-[#111]'
                  : 'text-[#6b7280] hover:text-[#111]'
              }`}
            >
              <Layers size={13} /> Field Info
            </button>
          </div>

          {fieldCardTab === 'soil' && (
            <FieldSoilCard
              fieldId={selected.id}
              fieldName={selected.name}
              fieldAreaHa={selected.area_hectares}
              notify={notify}
            />
          )}

          {fieldCardTab === 'nasa' && (
            <FieldEnvironmentalCard
              fieldId={selected.id}
              fieldName={selected.name}
              fieldAreaHa={selected.area_hectares}
              notify={notify}
            />
          )}

          {fieldCardTab === 'details' && (
            <>
              <div className="dates">
                <div>
                  <span>Area</span>
                  <b>{selected.area_hectares.toFixed(2)} ha</b>
                </div>
                <div>
                  <span>Current Crop</span>
                  <b>{selected.current_crop || 'None'}</b>
                </div>
              </div>

              <div className="sensor-box mb-3">
                <div>
                  <span>Provenance</span>
                  <b>{selected.boundary_source}</b>
                </div>
                <div>
                  <span>Boundary ID</span>
                  <b className="truncate max-w-[130px]">
                    {selected.source_boundary_id || 'User-drawn'}
                  </b>
                </div>
                {selected.land_use_category && (
                  <div>
                    <span>Category</span>
                    <b>{selected.land_use_category}</b>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="space-y-2 mt-3">
            <button
              onClick={() => props.navigate('weather', selected.id)}
              className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow border border-slate-700 transition-colors"
            >
              <CloudSun size={14} className="text-amber-400" /> Weather &amp; 3D Cloud Simulation
            </button>

            <button
              onClick={() => (onOpenAnalytics ? onOpenAnalytics(selected.id) : navigate('rotation-studio'))}
              className="w-full py-2.5 rounded-xl bg-[#1fa35b] hover:bg-[#188a4c] text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow"
            >
              <Sparkles size={14} /> Field Analytics & Historical Report
            </button>

            <button
              onClick={() => navigate('rotation-studio')}
              className="w-full py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold text-xs flex items-center justify-center gap-1.5"
            >
              <Sprout size={13} /> Rotation Studio
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onEdit(selected)}
                className="py-2 rounded-xl bg-[#f0f0f0] hover:bg-[#e4e4e4] text-[#1b1b1b] font-semibold text-xs flex items-center justify-center gap-1"
              >
                <Pencil size={13} /> Edit Field
              </button>
              <button
                onClick={() => onDelete(selected)}
                className="py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 font-semibold text-xs flex items-center justify-center gap-1"
              >
                <Trash2 size={13} /> Delete
              </button>
            </div>
          </div>

          <footer className="mt-3">
            <span>Verified Record</span>
            <p className="text-xs text-[#aaa]">
              {selected.attribution || '© MLEUV, dl-de/by-2-0'}
            </p>
          </footer>
        </aside>
      )}

      {/* Map Floating Controls */}
      <div className="map-controls">
        <button onClick={() => setLayersOpen(!layersOpen)}>
          <Layers3 />
        </button>
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
