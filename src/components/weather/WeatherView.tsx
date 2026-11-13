import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, GeoJSON, Marker, useMap } from 'react-leaflet';
import {
  Cloud,
  CloudSun,
  CloudRain,
  Sun,
  Wind,
  Droplets,
  ChevronDown,
  X,
  Play,
  Pause,
  Plus,
  RefreshCw,
  ExternalLink,
  Radio,
  Satellite,
  Sparkles,
  Trash2,
  Layers,
} from 'lucide-react';
import {
  fetchAllFieldsWeather,
  fetchAvailableFields,
  fetchFieldWeather,
  addVirtualStation,
  deleteVirtualStation,
  clearAllVirtualStations,
  type FieldWeatherSummary,
  type AvailableField,
  type FieldWeatherData,
  type HourlyForecastPoint,
} from '../../services/weatherApi';
import { createVirtualStationDivIcon } from './VirtualWeatherStationMarker';
import { ThreeSatelliteViewer } from './ThreeSatelliteViewer';

// Map Recenter Helper
function MapController({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 1.2 });
  }, [center, zoom, map]);
  return null;
}

export function WeatherView({
  initialFieldId,
  onNavigateFieldAnalytics,
}: {
  initialFieldId?: string | null;
  onNavigateFieldAnalytics?: (fieldId: string) => void;
}) {
  const [availableFields, setAvailableFields] = useState<AvailableField[]>([]);
  const [fieldsSummary, setFieldsSummary] = useState<FieldWeatherSummary[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string>(initialFieldId || '');
  const [fieldWeather, setFieldWeather] = useState<FieldWeatherData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Layer switches: 'satellite' | 'ndvi' | 'weather' | 'clouds'
  const [activeLayer, setActiveLayer] = useState<'clouds' | 'weather' | 'ndvi' | 'satellite'>('clouds');

  // Scrubber / Radar playback state
  const [radarIndex, setRadarIndex] = useState<number>(3); // Default to 'Now' (index 3 in 7 frames)
  const [isPlayingRadar, setIsPlayingRadar] = useState<boolean>(false);
  const playbackTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Popups & Modals
  const [is3DExpanded, setIs3DExpanded] = useState<boolean>(false);
  const [stationModalOpen, setStationModalOpen] = useState<boolean>(false);
  const [activeStationPopup, setActiveStationPopup] = useState<FieldWeatherSummary | null>(null);
  const [activeFieldPopup, setActiveFieldPopup] = useState<AvailableField | null>(null);

  // 1. Initial Load of all fields and active stations
  const loadSummaries = useCallback(async () => {
    try {
      setRefreshing(true);
      const [allFields, summaries] = await Promise.all([
        fetchAvailableFields().catch(() => [] as AvailableField[]),
        fetchAllFieldsWeather().catch(() => [] as FieldWeatherSummary[]),
      ]);
      setAvailableFields(allFields);
      setFieldsSummary(summaries);

      if (!selectedFieldId) {
        if (summaries.length > 0) {
          setSelectedFieldId(summaries[0].field_id);
        } else if (allFields.length > 0) {
          setSelectedFieldId(allFields[0].field_id);
        }
      }
    } catch (err) {
      console.error('Failed to load fields and weather:', err);
    } finally {
      setRefreshing(false);
    }
  }, [selectedFieldId]);

  useEffect(() => {
    loadSummaries();
  }, [loadSummaries]);

  // 2. Load detailed weather for selected field (if selected)
  useEffect(() => {
    if (!selectedFieldId) return;
    let isCurrent = true;
    setLoading(true);

    fetchFieldWeather(selectedFieldId)
      .then((data) => {
        if (isCurrent) {
          setFieldWeather(data);
          const nowIdx = data.radar_timeline.findIndex((r) => r.is_now);
          if (nowIdx !== -1) setRadarIndex(nowIdx);
        }
      })
      .catch((err) => {
        console.error(`Failed to load weather for field ${selectedFieldId}:`, err);
      })
      .finally(() => {
        if (isCurrent) setLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedFieldId]);

  // Handle radar playback
  useEffect(() => {
    if (isPlayingRadar) {
      playbackTimerRef.current = setInterval(() => {
        setRadarIndex((prev) => {
          const maxIdx = fieldWeather?.radar_timeline.length ? fieldWeather.radar_timeline.length - 1 : 6;
          return prev >= maxIdx ? 0 : prev + 1;
        });
      }, 1200);
    } else {
      if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
    }
    return () => {
      if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
    };
  }, [isPlayingRadar, fieldWeather]);

  // Active field summary
  const currentSummary = useMemo(() => {
    return fieldsSummary.find((f) => f.field_id === selectedFieldId) || null;
  }, [fieldsSummary, selectedFieldId]);

  // Active available field
  const currentAvailableField = useMemo(() => {
    return availableFields.find((f) => f.field_id === selectedFieldId) || availableFields[0] || null;
  }, [availableFields, selectedFieldId]);

  // Center position for map
  const mapCenter: [number, number] = useMemo(() => {
    if (fieldWeather?.coordinates) return fieldWeather.coordinates;
    if (currentSummary?.coordinates) return currentSummary.coordinates;
    return [52.4312, 12.9948];
  }, [fieldWeather, currentSummary]);

  // Add virtual station
  const handleAddStation = async (fieldId: string) => {
    try {
      setRefreshing(true);
      await addVirtualStation(fieldId);
      await loadSummaries();
      setActiveFieldPopup(null);
    } catch (e) {
      console.error('Failed to add virtual station:', e);
    } finally {
      setRefreshing(false);
    }
  };

  // Delete virtual station
  const handleDeleteStation = async (fieldId: string) => {
    try {
      setRefreshing(true);
      await deleteVirtualStation(fieldId);
      await loadSummaries();
      setActiveStationPopup(null);
    } catch (e) {
      console.error('Failed to delete virtual station:', e);
    } finally {
      setRefreshing(false);
    }
  };

  // Clear all stations
  const handleClearAll = async () => {
    if (!window.confirm('Are you sure you want to delete all virtual weather stations?')) return;
    try {
      setRefreshing(true);
      await clearAllVirtualStations();
      await loadSummaries();
      setActiveStationPopup(null);
      setActiveFieldPopup(null);
    } catch (e) {
      console.error('Failed to clear all stations:', e);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="relative w-full h-full min-h-0 flex-1 overflow-hidden bg-[#F3F4F2] font-sans select-none flex flex-col">
      {/* 1. TOP FLOATING BAR (Light Theme) */}
      <div className="absolute top-4 left-4 z-[500] flex items-center gap-3">
        {/* Field Selector Pill */}
        <div className="bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl shadow-lg px-4 py-2 flex items-center gap-3">
          <div className="w-6 h-6 rounded-lg bg-[#1fa35b]/15 text-[#1fa35b] flex items-center justify-center font-extrabold text-xs">
            FS
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 cursor-pointer">
              <span className="text-sm font-bold text-slate-800 tracking-tight">
                {currentAvailableField?.field_name || 'All fields'}
              </span>
              <ChevronDown size={14} className="text-slate-500" />
            </div>
            <span className="text-[11px] text-slate-500 font-medium">Season 2026</span>
          </div>

          <div className="h-5 w-[1px] bg-slate-200 mx-1" />

          {/* Quick Field Selector Dropdown */}
          <select
            value={selectedFieldId}
            onChange={(e) => {
              setSelectedFieldId(e.target.value);
              const st = fieldsSummary.find((s) => s.field_id === e.target.value);
              if (st) {
                setActiveStationPopup(st);
                setActiveFieldPopup(null);
              }
            }}
            className="bg-transparent text-xs text-slate-700 font-semibold outline-none cursor-pointer pr-1"
          >
            {availableFields.map((f) => {
              const hasSt = fieldsSummary.some((s) => s.field_id === f.field_id);
              return (
                <option key={f.field_id} value={f.field_id} className="bg-white text-slate-800">
                  {f.field_name} {hasSt ? '⚡ (Station Active)' : '(No Station)'}
                </option>
              );
            })}
          </select>
        </div>

        {/* Add/Manage Virtual Stations button */}
        <button
          onClick={() => setStationModalOpen(true)}
          className="bg-white/95 backdrop-blur-md hover:bg-slate-50 text-slate-800 border border-slate-200/90 rounded-2xl shadow-lg px-3 py-2.5 flex items-center gap-2 text-xs font-bold transition-all hover:scale-105 active:scale-95"
          title="Manage Virtual Weather Stations"
        >
          <Radio size={15} className="text-[#1fa35b] animate-pulse" />
          <span>Virtual Stations ({fieldsSummary.length})</span>
        </button>

        {/* Refresh button */}
        <button
          onClick={loadSummaries}
          disabled={refreshing}
          className="bg-white/95 backdrop-blur-md hover:bg-slate-50 text-slate-600 hover:text-slate-900 border border-slate-200/90 rounded-2xl shadow-lg p-2.5 transition-all hover:scale-105"
          title="Refresh Live Weather"
        >
          <RefreshCw size={15} className={refreshing ? 'animate-spin text-[#1fa35b]' : ''} />
        </button>
      </div>

      {/* 2. TOP RIGHT FLOATING LAYER SWITCHER (Light Theme) */}
      <div className="absolute top-4 right-4 z-[500] flex flex-col gap-1.5 bg-white/95 backdrop-blur-md p-1.5 rounded-2xl border border-slate-200/90 shadow-lg">
        <button
          onClick={() => setActiveLayer('satellite')}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
            activeLayer === 'satellite'
              ? 'bg-[#1fa35b] text-white shadow-sm ring-2 ring-[#1fa35b]/30'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Layers size={15} />
          <span className="hidden sm:inline">Satellite</span>
        </button>

        <button
          onClick={() => setActiveLayer('ndvi')}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
            activeLayer === 'ndvi'
              ? 'bg-[#1fa35b] text-white shadow-sm ring-2 ring-[#1fa35b]/30'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Sparkles size={15} />
          <span className="hidden sm:inline">NDVI</span>
        </button>

        <button
          onClick={() => setActiveLayer('weather')}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
            activeLayer === 'weather'
              ? 'bg-[#1fa35b] text-white shadow-sm ring-2 ring-[#1fa35b]/30'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <CloudRain size={15} />
          <span className="hidden sm:inline">Weather</span>
        </button>

        <button
          onClick={() => setActiveLayer('clouds')}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
            activeLayer === 'clouds'
              ? 'bg-[#1fa35b] text-white shadow-sm ring-2 ring-[#1fa35b]/30'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Cloud size={15} />
          <span className="hidden sm:inline">Clouds</span>
        </button>
      </div>

      {/* 3. VERTICAL LEGENDS (Light Theme) */}
      <div className="absolute left-4 top-28 z-[500] flex flex-col gap-3 pointer-events-none">
        {/* NDVI Bar */}
        {activeLayer === 'ndvi' && (
          <div className="bg-white/95 backdrop-blur-md p-2.5 rounded-2xl border border-slate-200/90 shadow-lg flex flex-col items-center pointer-events-auto">
            <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-2">
              NDVI Index
            </span>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-36 rounded-full bg-gradient-to-b from-[#15803d] via-[#84cc16] via-[#facc15] to-[#ef4444] shadow-inner border border-slate-300" />
              <div className="flex flex-col justify-between h-36 text-[9px] font-bold text-slate-600">
                <span>0.95</span>
                <span>0.75</span>
                <span>0.50</span>
                <span>0.25</span>
                <span>0.00</span>
              </div>
            </div>
          </div>
        )}

        {/* Cloud Cover Bar */}
        {activeLayer === 'clouds' && (
          <div className="bg-white/95 backdrop-blur-md p-2.5 rounded-2xl border border-slate-200/90 shadow-lg flex flex-col items-center pointer-events-auto">
            <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-2">
              Cloud cover
            </span>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-36 rounded-full bg-gradient-to-b from-[#334155] via-[#60a5fa] to-[#f1f5f9] shadow-inner border border-slate-300" />
              <div className="flex flex-col justify-between h-36 text-[9px] font-bold text-slate-600">
                <span>100%</span>
                <span>75%</span>
                <span>50%</span>
                <span>25%</span>
                <span>0%</span>
              </div>
            </div>
          </div>
        )}

        {/* Precipitation Bar */}
        {activeLayer === 'weather' && (
          <div className="bg-white/95 backdrop-blur-md p-2.5 rounded-2xl border border-slate-200/90 shadow-lg flex flex-col items-center pointer-events-auto">
            <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-2">
              Radar Rain
            </span>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-36 rounded-full bg-gradient-to-b from-[#ff7a1a] via-[#1fa35b] to-transparent shadow-inner border border-slate-300" />
              <div className="flex flex-col justify-between h-36 text-[9px] font-bold text-slate-600">
                <span>Heavy</span>
                <span>Mod</span>
                <span>Light</span>
                <span>Trace</span>
                <span>Dry</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. LEAFLET FULLSCREEN SATELLITE MAP */}
      <div className="relative flex-1 w-full h-full min-h-0 bg-[#e2e8f0]">
        <MapContainer
          center={mapCenter}
          zoom={15}
          zoomControl={false}
          className="w-full h-full z-0"
          style={{ background: '#cbd5e1' }}
        >
          <MapController center={mapCenter} zoom={15} />

          {/* Satellite Base Layer */}
          <TileLayer
            attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />

          {/* Field Boundary Polygons for all available user fields */}
          {availableFields.map((f) => {
            const isSelected = f.field_id === selectedFieldId;
            const hasStation = fieldsSummary.some((s) => s.field_id === f.field_id);
            if (!f.geometry) return null;

            return (
              <GeoJSON
                key={`poly-${f.field_id}-${isSelected}-${hasStation}`}
                data={{
                  type: 'Feature',
                  properties: { name: f.field_name },
                  geometry: f.geometry,
                } as any}
                style={{
                  color: isSelected ? '#ffffff' : hasStation ? '#1fa35b' : '#38bdf8',
                  weight: isSelected ? 3.5 : 2,
                  opacity: 0.95,
                  fillColor:
                    activeLayer === 'ndvi'
                      ? '#16a34a'
                      : isSelected
                      ? '#1fa35b'
                      : hasStation
                      ? '#22c55e'
                      : '#38bdf8',
                  fillOpacity: activeLayer === 'ndvi' ? 0.45 : isSelected ? 0.28 : hasStation ? 0.2 : 0.1,
                  dashArray: hasStation ? undefined : '4 2',
                }}
                eventHandlers={{
                  click: () => {
                    setSelectedFieldId(f.field_id);
                    const st = fieldsSummary.find((s) => s.field_id === f.field_id);
                    if (st) {
                      setActiveStationPopup(st);
                      setActiveFieldPopup(null);
                    } else {
                      setActiveFieldPopup(f);
                      setActiveStationPopup(null);
                    }
                  },
                }}
              />
            );
          })}

          {/* Virtual Weather Station Markers (ONLY for fields that have an active station!) */}
          {fieldsSummary.map((station) => {
            const pos: [number, number] = station.coordinates || [52.415, 13.045];
            return (
              <Marker
                key={`station-${station.field_id}`}
                position={pos}
                icon={createVirtualStationDivIcon(station, station.field_id === selectedFieldId)}
                eventHandlers={{
                  click: () => {
                    setSelectedFieldId(station.field_id);
                    setActiveStationPopup(station);
                    setActiveFieldPopup(null);
                  },
                }}
              />
            );
          })}
        </MapContainer>
      </div>

      {/* 5. FLOATING STATION CARD POPUP (On click station) */}
      {activeStationPopup && (
        <div className="absolute top-20 right-4 z-[500] w-80 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-3xl p-5 shadow-2xl flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <Radio size={16} className="text-[#1fa35b] animate-pulse" />
              <div className="flex flex-col">
                <span className="text-xs font-extrabold text-slate-900">{activeStationPopup.field_name}</span>
                <span className="text-[10px] text-slate-500 font-semibold">{activeStationPopup.farm_name}</span>
              </div>
            </div>
            <button
              onClick={() => setActiveStationPopup(null)}
              className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X size={15} />
            </button>
          </div>

          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center font-bold shadow-inner">
                {activeStationPopup.icon === 'sunny' ? (
                  <Sun size={22} />
                ) : activeStationPopup.icon === 'partly_cloudy' ? (
                  <CloudSun size={22} />
                ) : (
                  <Cloud size={22} />
                )}
              </div>
              <div>
                <div className="text-2xl font-black text-slate-900 tracking-tight">
                  {Math.round(activeStationPopup.temperature_c)}°C
                </div>
                <div className="text-[11px] font-semibold text-slate-600">{activeStationPopup.condition}</div>
              </div>
            </div>
            <div className="text-right text-[11px] font-bold text-slate-600 flex flex-col gap-1">
              <div>💨 {Math.round(activeStationPopup.wind_speed_ms)} m/s {activeStationPopup.wind_arrow}</div>
              <div>💧 {Math.round(activeStationPopup.humidity_percent)}% hum</div>
              <div>🌧️ {activeStationPopup.precipitation_mm} mm</div>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
            <button
              onClick={() => setIs3DExpanded(true)}
              className="flex-1 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm"
            >
              <Sparkles size={13} className="text-[#1fa35b]" />
              <span>3D Surface</span>
            </button>

            {onNavigateFieldAnalytics && (
              <button
                onClick={() => onNavigateFieldAnalytics(activeStationPopup.field_id)}
                className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                title="Open Field Analytics"
              >
                <ExternalLink size={13} />
              </button>
            )}

            <button
              onClick={() => handleDeleteStation(activeStationPopup.field_id)}
              className="py-2 px-3 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors border border-red-200 shadow-sm"
              title="Remove Weather Station from this field"
            >
              <Trash2 size={13} />
              <span>Remove</span>
            </button>
          </div>
        </div>
      )}

      {/* 6. FLOATING ADD STATION CARD (On click field without station) */}
      {activeFieldPopup && (
        <div className="absolute top-20 right-4 z-[500] w-72 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-3xl p-4 shadow-2xl flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div>
              <span className="text-xs font-extrabold text-slate-900 block">{activeFieldPopup.field_name}</span>
              <span className="text-[10px] text-slate-500 font-semibold">{activeFieldPopup.farm_name}</span>
            </div>
            <button
              onClick={() => setActiveFieldPopup(null)}
              className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <X size={15} />
            </button>
          </div>

          <p className="text-[11px] text-slate-600 leading-snug">
            No virtual weather station installed on this field. Add a station to monitor hyper-local wind, rainfall, and microclimates.
          </p>

          <button
            onClick={() => handleAddStation(activeFieldPopup.field_id)}
            className="w-full py-2.5 rounded-xl bg-[#1fa35b] hover:bg-[#188a4c] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md transition-all active:scale-95"
          >
            <Plus size={14} />
            <span>Add Weather Station</span>
          </button>
        </div>
      )}

      {/* 7. RADAR TIMELINE SCRUBBER (Floating cleanly over the map bottom) */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-[500] w-[92%] max-w-xl transition-all">
        <div className="bg-white/95 backdrop-blur-md px-5 py-2.5 rounded-2xl border border-slate-200/90 shadow-xl flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setIsPlayingRadar(!isPlayingRadar)}
              className="p-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors shadow-sm"
            >
              {isPlayingRadar ? <Pause size={13} /> : <Play size={13} className="ml-0.5" />}
            </button>

            {/* Time badge pill */}
            <div className="px-3 py-1 rounded-full bg-slate-900 text-white font-black text-xs shadow-md">
              {fieldWeather?.radar_timeline[radarIndex]?.time_label || '14:39'}
            </div>

            <span className="text-[11px] font-bold text-[#1fa35b]">
              {fieldWeather?.radar_timeline[radarIndex]?.is_now ? 'Live Now' : 'Radar Simulation'}
            </span>
          </div>

          {/* Scrubber slider */}
          <div className="relative flex items-center px-1">
            <input
              type="range"
              min={0}
              max={Math.max(1, (fieldWeather?.radar_timeline.length || 7) - 1)}
              value={radarIndex}
              onChange={(e) => {
                setIsPlayingRadar(false);
                setRadarIndex(Number(e.target.value));
              }}
              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#1fa35b]"
            />
          </div>

          <div className="flex justify-between text-[11px] font-semibold text-slate-500 px-1">
            <span>{fieldWeather?.radar_timeline[0]?.time_label || '12:39'}</span>
            <span className="text-slate-900 font-extrabold">Now</span>
            <span>
              {fieldWeather?.radar_timeline[fieldWeather.radar_timeline.length - 1]?.time_label || '18:39'}
            </span>
          </div>
        </div>
      </div>

      {/* 8. EXPANDED 3D SATELLITE MODAL (Light Theme) */}
      {is3DExpanded && (
        <div className="fixed inset-0 z-[1000] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="relative w-full max-w-4xl h-[80vh] bg-white border border-slate-200 rounded-3xl overflow-hidden flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-[#1fa35b]" />
                <h3 className="text-base font-extrabold text-slate-900">
                  3D Satellite Surface Simulation • {currentAvailableField?.field_name}
                </h3>
              </div>
              <button
                onClick={() => setIs3DExpanded(false)}
                className="p-1.5 rounded-full bg-slate-200/80 hover:bg-slate-300 text-slate-700"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 w-full h-full relative">
              <ThreeSatelliteViewer
                fieldName={currentAvailableField?.field_name}
                timestamp={fieldWeather?.current.observation_time || '10 Nov 2026, 10:24'}
                simulationParams={fieldWeather?.threejs_simulation}
                isExpanded={true}
                onToggleExpand={() => setIs3DExpanded(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* 9. VIRTUAL WEATHER STATIONS MANAGER MODAL (Add / Remove by Field) */}
      {stationModalOpen && (
        <div className="fixed inset-0 z-[1000] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Radio size={18} className="text-[#1fa35b]" />
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Virtual Weather Stations</h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Add or remove virtual stations on your farm fields
                  </p>
                </div>
              </div>
              <button
                onClick={() => setStationModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            {/* Quick summary and Clear All */}
            <div className="flex items-center justify-between bg-slate-50 p-3 rounded-2xl border border-slate-200">
              <span className="text-xs font-bold text-slate-700">
                {fieldsSummary.length} of {availableFields.length} fields have active stations
              </span>
              {fieldsSummary.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="text-xs font-bold text-red-600 hover:text-red-700 hover:underline flex items-center gap-1"
                >
                  <Trash2 size={12} />
                  <span>Remove All</span>
                </button>
              )}
            </div>

            {/* Field rows */}
            <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
              {availableFields.map((f) => {
                const station = fieldsSummary.find((s) => s.field_id === f.field_id);
                return (
                  <div
                    key={`manage-${f.field_id}`}
                    className="flex items-center justify-between p-3 rounded-2xl border border-slate-200/90 hover:border-slate-300 bg-white transition-all shadow-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${
                          station
                            ? 'bg-emerald-100 text-[#1fa35b]'
                            : 'bg-slate-100 text-slate-400'
                        }`}
                      >
                        {station ? <Radio size={16} /> : <Radio size={16} />}
                      </div>

                      <div className="flex flex-col">
                        <span className="text-xs font-extrabold text-slate-900">{f.field_name}</span>
                        <span className="text-[10px] text-slate-500 font-medium">
                          {station
                            ? `${Math.round(station.temperature_c)}°C • ${Math.round(station.wind_speed_ms)} m/s ${station.wind_arrow}`
                            : 'No station installed'}
                        </span>
                      </div>
                    </div>

                    <div>
                      {station ? (
                        <button
                          onClick={() => handleDeleteStation(f.field_id)}
                          className="px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-xs font-bold transition-colors flex items-center gap-1"
                        >
                          <Trash2 size={12} />
                          <span>Remove</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleAddStation(f.field_id)}
                          className="px-3 py-1.5 rounded-xl bg-[#1fa35b] hover:bg-[#188a4c] text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1 active:scale-95"
                        >
                          <Plus size={13} />
                          <span>Add Station</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => setStationModalOpen(false)}
              className="w-full py-2.5 bg-[#1fa35b] hover:bg-[#188a4c] text-white font-bold text-xs rounded-xl transition-colors shadow-md mt-1"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
