import React, { useEffect, useMemo, useState, useCallback } from 'react';
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
  ChevronUp,
  X,
  Plus,
  RefreshCw,
  ExternalLink,
  Radio,
  Satellite,
  Sparkles,
  Trash2,
  Layers,
  Thermometer,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
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
  type DailyForecastPoint,
  type MonthlyOutlookPoint,
  type MonthlyDayTrend,
} from '../../services/weatherApi';
import { createVirtualStationDivIcon } from './VirtualWeatherStationMarker';
import { ThreeSatelliteViewer } from './ThreeSatelliteViewer';
import { useI18n } from '../../i18n';
import { LanguageSwitcher } from '../common/LanguageSwitcher';

// Map Recenter Helper
function MapController({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 1.2 });
  }, [center, zoom, map]);
  return null;
}

// Sparkline Step Curve for Microclimate Cards (Matches OneSoil UI)
function StepSparkline({
  data,
  color = '#f59e0b',
  width = 110,
  height = 24,
  fillColor,
}: {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
  fillColor?: string;
}) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);

  let path = `M 0 ${height - ((data[0] - min) / range) * (height - 6) - 3}`;
  for (let i = 1; i < data.length; i++) {
    const xCurr = i * stepX;
    const yCurr = height - ((data[i] - min) / range) * (height - 6) - 3;
    path += ` H ${xCurr} V ${yCurr}`;
  }
  const areaPath = `${path} V ${height} H 0 Z`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      {fillColor && <path d={areaPath} fill={fillColor} />}
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="miter" />
    </svg>
  );
}

// Sparkline Bar for Precipitation
function BarSparkline({
  data,
  color = '#0284c7',
  width = 110,
  height = 24,
}: {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const barWidth = Math.max(3, width / data.length - 2);

  return (
    <svg width={width} height={height} className="overflow-visible">
      {data.map((val, i) => {
        const barHeight = Math.max(val > 0 ? 3 : 1, (val / max) * (height - 3));
        const x = i * (width / data.length);
        const y = height - barHeight;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barWidth}
            height={barHeight}
            fill={val > 0 ? color : '#e2e8f0'}
            rx={1}
          />
        );
      })}
    </svg>
  );
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

  // Sync selected field with dashboard selection by default
  useEffect(() => {
    if (initialFieldId) {
      setSelectedFieldId(initialFieldId);
    }
  }, [initialFieldId]);

  // Layer switches: 'satellite' | 'ndvi' | 'weather'
  const [activeLayer, setActiveLayer] = useState<'satellite' | 'ndvi' | 'weather'>('satellite');

  // Weather Card Tabs: 'daily' | 'weekly' | 'monthly' (No duplicate dropdown)
  const [forecastTab, setForecastTab] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [isCardMinimized, setIsCardMinimized] = useState<boolean>(false);

  // Popups & Modals
  const [is3DExpanded, setIs3DExpanded] = useState<boolean>(false);
  const [stationModalOpen, setStationModalOpen] = useState<boolean>(false);
  const [activeStationPopup, setActiveStationPopup] = useState<FieldWeatherSummary | null>(null);

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
        if (initialFieldId && allFields.some((f) => f.field_id === initialFieldId)) {
          setSelectedFieldId(initialFieldId);
        } else if (allFields.length > 0) {
          setSelectedFieldId(allFields[0].field_id);
        }
      }
    } catch (err) {
      console.error('Failed to load fields and weather:', err);
    } finally {
      setRefreshing(false);
    }
  }, [selectedFieldId, initialFieldId]);

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

  // Active field summary
  const currentSummary = useMemo(() => {
    return fieldsSummary.find((f) => f.field_id === selectedFieldId) || null;
  }, [fieldsSummary, selectedFieldId]);

  // Active available field
  const currentAvailableField = useMemo(() => {
    return (
      availableFields.find((f) => f.field_id === selectedFieldId) ||
      availableFields[0] ||
      null
    );
  }, [availableFields, selectedFieldId]);

  // Whether current selected field has an active virtual station
  const hasStation = useMemo(() => {
    return fieldsSummary.some((s) => s.field_id === selectedFieldId);
  }, [fieldsSummary, selectedFieldId]);

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
      const data = await fetchFieldWeather(fieldId);
      setFieldWeather(data);
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
    } catch (e) {
      console.error('Failed to clear all stations:', e);
    } finally {
      setRefreshing(false);
    }
  };

  // Spraying windows calculation from hourly forecast
  const sprayingSlots = useMemo(() => {
    const hours = fieldWeather?.forecast_hourly || [];
    if (hours.length === 0) return [];
    // Take 6 time slots across next 24h
    const indices = [0, 3, 6, 9, 12, 15];
    return indices.map((idx) => {
      const h = hours[idx] || hours[hours.length - 1];
      const wind = h.wind_speed_ms;
      const rain = h.precipitation_mm;
      let status: 'safe' | 'caution' | 'unsuitable' = 'safe';
      if (wind > 6.0 || rain > 0.4) {
        status = 'unsuitable';
      } else if (wind > 4.5 || rain > 0.1) {
        status = 'caution';
      }
      const labelText = (h as any).label || (h.time ? h.time.slice(11, 16) : `${idx * 3}:00`);
      return {
        label: idx === 0 ? 'Now' : labelText,
        wind_speed: wind,
        wind_arrow: (h as any).wind_arrow || '↑',
        rain_mm: rain,
        status,
      };
    });
  }, [fieldWeather]);

  // Spray window current status
  const currentSprayStatus = sprayingSlots[0]?.status || 'safe';

  // 12-hour data series for microclimate cards
  const hourly12 = useMemo(() => {
    return (fieldWeather?.forecast_hourly || []).slice(0, 12);
  }, [fieldWeather]);

  const temps12 = useMemo(() => hourly12.map((h) => h.temperature_c), [hourly12]);
  const precips12 = useMemo(() => hourly12.map((h) => h.precipitation_mm), [hourly12]);
  const winds12 = useMemo(() => hourly12.map((h) => h.wind_speed_ms), [hourly12]);
  const clouds12 = useMemo(() => hourly12.map((h) => h.cloud_cover_percent), [hourly12]);
  const hums12 = useMemo(
    () => (fieldWeather?.current ? [fieldWeather.current.humidity_percent, 75, 72, 68, 65, 62, 65, 70, 74, 78, 80, 82] : [70, 70]),
    [fieldWeather]
  );
  const dewPoints12 = useMemo(
    () => (fieldWeather?.current ? [Math.round(fieldWeather.current.temperature_c - (100 - fieldWeather.current.humidity_percent) / 5), 2, 2, 3, 3, 2, 2, 1, 1, 0, 0, 0] : [2, 2]),
    [fieldWeather]
  );

  return (
    <div className="relative w-full h-full min-h-0 flex-1 overflow-hidden bg-[#F3F4F2] font-sans select-none flex flex-col">
      {/* 1. TOP FLOATING BAR (Clean, Single Field Selector Capsule) */}
      <div className="absolute top-4 left-4 z-[500] flex items-center gap-3">
        {/* Field Selector Pill - Clean, with integrated selection, no duplicate dropdown */}
        <div className="relative bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl shadow-lg px-4 py-2 flex items-center gap-3 group hover:border-[#1fa35b] transition-all">
          <div className="w-6 h-6 rounded-lg bg-[#1fa35b]/15 text-[#1fa35b] flex items-center justify-center font-extrabold text-xs">
            FS
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-slate-900 tracking-tight">
                {currentAvailableField?.field_name || 'Select Field'}
              </span>
              <ChevronDown size={14} className="text-slate-500 group-hover:text-[#1fa35b] transition-colors" />
            </div>
            <span className="text-[11px] text-slate-500 font-medium">Season 2026</span>
          </div>

          {/* Native invisible overlay for instant field switching */}
          <select
            value={selectedFieldId}
            onChange={(e) => {
              setSelectedFieldId(e.target.value);
              const st = fieldsSummary.find((s) => s.field_id === e.target.value);
              if (st) {
                setActiveStationPopup(st);
              }
            }}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            title="Switch Active Field"
          >
            {availableFields.map((f) => {
              const isSt = fieldsSummary.some((s) => s.field_id === f.field_id);
              return (
                <option key={f.field_id} value={f.field_id}>
                  {f.field_name} {isSt ? '⚡ (Station Active)' : '(No Station)'}
                </option>
              );
            })}
          </select>
        </div>

        {/* Add/Manage Virtual Stations button */}
        <button
          onClick={() => setStationModalOpen(true)}
          className="bg-white/95 backdrop-blur-md hover:bg-slate-50 text-slate-800 border border-slate-200/90 rounded-2xl shadow-lg px-3.5 py-2.5 flex items-center gap-2 text-xs font-bold transition-all hover:scale-105 active:scale-95"
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

      {/* 2. TOP RIGHT FLOATING LAYER SWITCHER (Satellite, NDVI, Weather) */}
      <div className="absolute top-4 right-4 z-[500] flex flex-col gap-1.5 bg-white/95 backdrop-blur-md p-1.5 rounded-2xl border border-slate-200/90 shadow-lg">
        <button
          onClick={() => setActiveLayer('satellite')}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all ${activeLayer === 'satellite'
            ? 'bg-[#1fa35b] text-white shadow-sm ring-2 ring-[#1fa35b]/30'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
        >
          <Layers size={15} />
          <span className="hidden sm:inline">Satellite</span>
        </button>

        <button
          onClick={() => setActiveLayer('ndvi')}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all ${activeLayer === 'ndvi'
            ? 'bg-[#1fa35b] text-white shadow-sm ring-2 ring-[#1fa35b]/30'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
        >
          <Sparkles size={15} />
          <span className="hidden sm:inline">NDVI</span>
        </button>

        <button
          onClick={() => setActiveLayer('weather')}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all ${activeLayer === 'weather'
            ? 'bg-[#1fa35b] text-white shadow-sm ring-2 ring-[#1fa35b]/30'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
        >
          <CloudRain size={15} />
          <span className="hidden sm:inline">Weather</span>
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

          {/* Field Boundary Polygons */}
          {availableFields.map((f) => {
            const isSelected = f.field_id === selectedFieldId;
            const isStationActive = fieldsSummary.some((s) => s.field_id === f.field_id);
            if (!f.geometry) return null;

            return (
              <GeoJSON
                key={`poly-${f.field_id}-${isSelected}-${isStationActive}`}
                data={{
                  type: 'Feature',
                  properties: { name: f.field_name },
                  geometry: f.geometry,
                } as any}
                style={{
                  color: isSelected ? '#ffffff' : isStationActive ? '#1fa35b' : '#38bdf8',
                  weight: isSelected ? 3.5 : 2,
                  opacity: 0.95,
                  fillColor:
                    activeLayer === 'ndvi'
                      ? '#16a34a'
                      : isSelected
                        ? '#1fa35b'
                        : isStationActive
                          ? '#22c55e'
                          : '#38bdf8',
                  fillOpacity: activeLayer === 'ndvi' ? 0.45 : isSelected ? 0.28 : isStationActive ? 0.2 : 0.1,
                  dashArray: isStationActive ? undefined : '4 2',
                }}
                eventHandlers={{
                  click: () => {
                    setSelectedFieldId(f.field_id);
                    const st = fieldsSummary.find((s) => s.field_id === f.field_id);
                    if (st) {
                      setActiveStationPopup(st);
                    }
                  },
                }}
              />
            );
          })}

          {/* Virtual Weather Station Markers */}
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
                  },
                }}
              />
            );
          })}
        </MapContainer>
      </div>

      {/* 5. FLOATING STATION CARD POPUP */}
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

      {/* 6. COMPREHENSIVE WEATHER FORECAST & TELEMETRY CARD (Daily / Weekly / Monthly) */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-[500] w-[95%] max-w-4xl transition-all">
        <div className="bg-white/95 backdrop-blur-md rounded-3xl border border-slate-200/90 shadow-2xl p-4 sm:p-5 flex flex-col gap-4 transition-all max-h-[82vh] overflow-y-auto">
          {/* Top Bar of the Card */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            {/* Title & Station Name */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-100/80 text-[#1fa35b] flex items-center justify-center font-black text-sm shadow-inner flex-shrink-0">
                <Radio size={20} className={hasStation ? 'animate-pulse' : 'text-slate-400'} />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-base font-black text-slate-900 tracking-tight">
                    {hasStation
                      ? `Virtual Weather Station • ${currentAvailableField?.field_name || 'Field'}`
                      : `${currentAvailableField?.field_name || 'Field'}`}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${hasStation
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}
                  >
                    {hasStation ? 'Station Active' : 'No Station'}
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 font-semibold">
                  {currentAvailableField?.farm_name || 'My Farm'} • Season 2026
                </span>
              </div>
            </div>

            {/* Segmented Selector Buttons (Only 1 clean selector, NO duplicate dropdown!) */}
            <div className="flex items-center gap-2 ml-auto">
              {hasStation && (
                <div className="flex items-center p-1 bg-slate-100 rounded-2xl border border-slate-200 shadow-inner">
                  <button
                    onClick={() => setForecastTab('daily')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${forecastTab === 'daily'
                      ? 'bg-[#1fa35b] text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                      }`}
                  >
                    Daily
                  </button>
                  <button
                    onClick={() => setForecastTab('weekly')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${forecastTab === 'weekly'
                      ? 'bg-[#1fa35b] text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                      }`}
                  >
                    Weekly
                  </button>
                  <button
                    onClick={() => setForecastTab('monthly')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${forecastTab === 'monthly'
                      ? 'bg-[#1fa35b] text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                      }`}
                  >
                    Monthly
                  </button>
                </div>
              )}

              {/* Minimize/Expand Toggle */}
              <button
                onClick={() => setIsCardMinimized(!isCardMinimized)}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors border border-slate-200 shadow-sm"
                title={isCardMinimized ? 'Expand Weather Card' : 'Minimize Weather Card'}
              >
                {isCardMinimized ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>
          </div>

          {/* Card Body */}
          {!isCardMinimized && (
            <div>
              {/* CASE A: NO STATION INSTALLED ON SELECTED FIELD */}
              {!hasStation ? (
                <div className="flex flex-col items-center justify-center py-7 px-4 text-center bg-slate-50/70 rounded-2xl border border-slate-200/80">
                  <div className="w-14 h-14 rounded-3xl bg-slate-100 border border-slate-200 text-slate-400 flex items-center justify-center mb-3">
                    <Radio size={26} />
                  </div>
                  <h4 className="text-base font-extrabold text-slate-900 mb-1">
                    No Virtual Weather Station on {currentAvailableField?.field_name || 'this field'}
                  </h4>
                  <p className="text-xs text-slate-500 max-w-md mb-4 leading-relaxed font-medium">
                    Deploy a virtual weather station to stream live microclimate telemetry, spraying windows,
                    step charts, and hyper-local agricultural weather forecasts.
                  </p>
                  <button
                    onClick={() => handleAddStation(selectedFieldId)}
                    className="px-5 py-2.5 rounded-xl bg-[#1fa35b] hover:bg-[#188a4c] text-white font-bold text-xs flex items-center gap-2 shadow-md transition-all active:scale-95"
                  >
                    <Plus size={16} />
                    <span>Install Virtual Weather Station on this Field</span>
                  </button>
                </div>
              ) : (
                /* CASE B: ACTIVE STATION TELEMETRY */
                <div className="flex flex-col gap-4">
                  {/* 1. DAILY VIEW: 6 TELEMETRY METRIC CARDS WITH STEP CHARTS (Screenshot 2) */}
                  {forecastTab === 'daily' && (
                    <div className="flex flex-col gap-4">
                      {/* Grid of 6 Microclimate Step Cards */}
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-3">
                        {/* 1. Temperature */}
                        <div className="bg-slate-50/90 border border-slate-200/90 rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between shadow-sm">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 mb-0.5">
                            <Thermometer size={14} className="text-amber-500" />
                            <span>Temperature</span>
                          </div>
                          <div className="text-2xl font-black text-slate-900 my-1">
                            {fieldWeather ? `${Math.round(fieldWeather.current.temperature_c)}°` : '--'}
                          </div>
                          <div className="pt-2">
                            <StepSparkline data={temps12} color="#f59e0b" width={110} height={24} fillColor="rgba(245, 158, 11, 0.15)" />
                            <div className="flex justify-between text-[8px] font-bold text-slate-400 mt-1">
                              <span>Now</span>
                              <span>10:00</span>
                              <span>22:00</span>
                            </div>
                          </div>
                        </div>

                        {/* 2. Precipitation */}
                        <div className="bg-slate-50/90 border border-slate-200/90 rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between shadow-sm">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 mb-0.5">
                            <CloudRain size={14} className="text-sky-500" />
                            <span>Precipitation</span>
                          </div>
                          <div className="text-2xl font-black text-slate-900 my-1">
                            {fieldWeather ? `${fieldWeather.current.precipitation_mm} mm` : '0 mm'}
                          </div>
                          <div className="pt-2">
                            <BarSparkline data={precips12} color="#0284c7" width={110} height={24} />
                            <div className="flex justify-between text-[8px] font-bold text-slate-400 mt-1">
                              <span>Now</span>
                              <span>10:00</span>
                              <span>22:00</span>
                            </div>
                          </div>
                        </div>

                        {/* 3. Winds */}
                        <div className="bg-slate-50/90 border border-slate-200/90 rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between shadow-sm">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 mb-0.5">
                            <Wind size={14} className="text-slate-600" />
                            <span>Winds</span>
                          </div>
                          <div className="text-2xl font-black text-slate-900 my-1">
                            {fieldWeather ? `${Math.round(fieldWeather.current.wind_speed_ms)} m/s ${fieldWeather.current.wind_arrow}` : '5 m/s'}
                          </div>
                          <div className="pt-2">
                            <StepSparkline data={winds12} color="#64748b" width={110} height={24} />
                            <div className="flex justify-between text-[8px] font-bold text-slate-400 mt-1">
                              <span>Now</span>
                              <span>10:00</span>
                              <span>22:00</span>
                            </div>
                          </div>
                        </div>

                        {/* 4. Cloud Cover */}
                        <div className="bg-slate-50/90 border border-slate-200/90 rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between shadow-sm">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 mb-0.5">
                            <Cloud size={14} className="text-slate-500" />
                            <span>Cloud cover</span>
                          </div>
                          <div className="text-2xl font-black text-slate-900 my-1">
                            {fieldWeather ? `${fieldWeather.current.cloud_cover_percent}%` : '42%'}
                          </div>
                          <div className="pt-2">
                            <StepSparkline data={clouds12} color="#64748b" width={110} height={24} />
                            <div className="flex justify-between text-[8px] font-bold text-slate-400 mt-1">
                              <span>Now</span>
                              <span>10:00</span>
                              <span>22:00</span>
                            </div>
                          </div>
                        </div>

                        {/* 5. Humidity */}
                        <div className="bg-slate-50/90 border border-slate-200/90 rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between shadow-sm">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 mb-0.5">
                            <Droplets size={14} className="text-sky-500" />
                            <span>Humidity</span>
                          </div>
                          <div className="text-2xl font-black text-slate-900 my-1">
                            {fieldWeather ? `${Math.round(fieldWeather.current.humidity_percent)}%` : '68%'}
                          </div>
                          <div className="pt-2">
                            <StepSparkline data={hums12} color="#38bdf8" width={110} height={24} />
                            <div className="flex justify-between text-[8px] font-bold text-slate-400 mt-1">
                              <span>Now</span>
                              <span>10:00</span>
                              <span>22:00</span>
                            </div>
                          </div>
                        </div>

                        {/* 6. Dew Point */}
                        <div className="bg-slate-50/90 border border-slate-200/90 rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between shadow-sm">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 mb-0.5">
                            <Sparkles size={14} className="text-emerald-600" />
                            <span>Dew point</span>
                          </div>
                          <div className="text-2xl font-black text-slate-900 my-1">
                            {fieldWeather
                              ? `${Math.round(fieldWeather.current.temperature_c - (100 - fieldWeather.current.humidity_percent) / 5)}°`
                              : '1°'}
                          </div>
                          <div className="pt-2">
                            <StepSparkline data={dewPoints12} color="#10b981" width={110} height={24} />
                            <div className="flex justify-between text-[8px] font-bold text-slate-400 mt-1">
                              <span>Now</span>
                              <span>10:00</span>
                              <span>22:00</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* SPRAYING WINDOWS (Crucial for farmers, Screenshot 1 & 2) */}
                      <div className="bg-slate-50/90 border border-slate-200/90 rounded-2xl p-4 flex flex-col gap-3 shadow-sm">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-sm font-extrabold text-slate-900">Spraying Windows</h4>
                            <p className="text-[11px] text-slate-500 font-medium">
                              Know exactly when it's safe to spray — based on wind, rain, and field conditions
                            </p>
                          </div>
                          <div
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${currentSprayStatus === 'safe'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : currentSprayStatus === 'caution'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-red-50 text-red-800 border-red-200'
                              }`}
                          >
                            {currentSprayStatus === 'safe' ? (
                              <CheckCircle2 size={13} className="text-emerald-600" />
                            ) : currentSprayStatus === 'caution' ? (
                              <AlertTriangle size={13} className="text-amber-600" />
                            ) : (
                              <AlertTriangle size={13} className="text-red-600" />
                            )}
                            <span>
                              {currentSprayStatus === 'safe'
                                ? 'Safe Window Open'
                                : currentSprayStatus === 'caution'
                                  ? 'Moderate Caution'
                                  : 'Do Not Spray'}
                            </span>
                          </div>
                        </div>

                        {/* Hourly Spraying Slots */}
                        <div className="grid grid-cols-6 gap-1 bg-white p-3 rounded-xl border border-slate-200">
                          {sprayingSlots.map((slot, i) => (
                            <div key={`spray-${i}`} className="flex flex-col items-center justify-between text-center min-h-[90px]">
                              {/* Wind vector */}
                              <div className="flex flex-col items-center text-[10px] font-bold text-slate-700">
                                <span className="text-sm leading-none">{slot.wind_arrow}</span>
                                <span>{Math.round(slot.wind_speed)} m/s</span>
                              </div>

                              {/* Rain indicator */}
                              <div className="my-1.5">
                                {slot.rain_mm > 0 ? (
                                  <div className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 text-[10px] font-bold">
                                    {slot.rain_mm} mm
                                  </div>
                                ) : (
                                  <span className="text-[10px] font-semibold text-slate-400">0 mm</span>
                                )}
                              </div>

                              {/* Color Status Bar Segment */}
                              <div
                                className={`w-full h-1.5 rounded-full ${slot.status === 'safe'
                                  ? 'bg-emerald-500'
                                  : slot.status === 'caution'
                                    ? 'bg-amber-400'
                                    : 'bg-rose-500'
                                  }`}
                              />

                              {/* Time label */}
                              <span className="text-[10px] font-bold text-slate-500 mt-1">{slot.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 2. WEEKLY VIEW: NEXT 7-DAY FORECAST TABLE (Screenshot 1) */}
                  {forecastTab === 'weekly' && (
                    <div className="bg-slate-50/90 border border-slate-200/90 rounded-2xl p-4 flex flex-col gap-3 shadow-sm">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <h4 className="text-sm font-extrabold text-slate-900">Next 7-day forecast</h4>
                        <span className="text-xs font-semibold text-slate-500">Agro-meteorological overview</span>
                      </div>

                      <div className="flex flex-col divide-y divide-slate-200/80">
                        {(fieldWeather?.forecast_daily || []).slice(0, 7).map((d, i) => (
                          <div key={`weekly-row-${i}`} className="py-2.5 flex items-center justify-between text-xs font-semibold">
                            {/* Day name */}
                            <div className="w-20 font-bold text-slate-900">
                              {i === 0 ? 'Today' : d.day_name}
                            </div>

                            {/* Weather Icon */}
                            <div className="w-10 flex justify-center text-slate-700">
                              {d.icon === 'sunny' ? (
                                <Sun size={20} className="text-amber-500" />
                              ) : d.icon === 'partly_cloudy' ? (
                                <CloudSun size={20} className="text-amber-400" />
                              ) : d.icon?.includes('rain') ? (
                                <CloudRain size={20} className="text-sky-500" />
                              ) : (
                                <Cloud size={20} className="text-slate-400" />
                              )}
                            </div>

                            {/* Temp Range: +3...8° */}
                            <div className="w-28 text-center font-extrabold text-slate-800">
                              {Math.round(d.temp_min_c) > 0 ? `+${Math.round(d.temp_min_c)}` : Math.round(d.temp_min_c)}
                              ...
                              {Math.round(d.temp_max_c) > 0 ? `${Math.round(d.temp_max_c)}°` : `${Math.round(d.temp_max_c)}°`}
                            </div>

                            {/* Wind vector */}
                            <div className="w-24 text-right font-bold text-slate-600">
                              {d.wind_arrow} {Math.round(d.wind_speed_ms)} m/s
                            </div>

                            {/* Rain amount */}
                            <div className="w-20 text-right font-bold">
                              {d.precipitation_mm > 0 ? (
                                <span className="text-sky-600">{d.precipitation_mm} mm</span>
                              ) : (
                                <span className="text-slate-400">0 mm</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 3. MONTHLY VIEW: 30-DAY AGRO-METEOROLOGICAL GRAPH (Requested by user) */}
                  {forecastTab === 'monthly' && (
                    <div className="flex flex-col gap-4">
                      {/* Top Monthly Metrics Row */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <div className="bg-slate-50/90 border border-slate-200 p-3 rounded-2xl">
                          <span className="text-[10px] font-bold text-slate-500 uppercase block">Monthly Avg Temp</span>
                          <span className="text-xl font-black text-slate-900">
                            {fieldWeather?.forecast_monthly?.[0]?.avg_temp_c || 6.8}°C
                          </span>
                        </div>
                        <div className="bg-slate-50/90 border border-slate-200 p-3 rounded-2xl">
                          <span className="text-[10px] font-bold text-slate-500 uppercase block">Expected Rain</span>
                          <span className="text-xl font-black text-sky-600">
                            {Math.round((fieldWeather?.forecast_monthly || []).reduce((acc, w) => acc + w.total_precip_mm, 0))} mm
                          </span>
                        </div>
                        <div className="bg-slate-50/90 border border-slate-200 p-3 rounded-2xl">
                          <span className="text-[10px] font-bold text-slate-500 uppercase block">Spray-Safe Days</span>
                          <span className="text-xl font-black text-[#1fa35b]">19 / 30 Days</span>
                        </div>
                        <div className="bg-slate-50/90 border border-slate-200 p-3 rounded-2xl">
                          <span className="text-[10px] font-bold text-slate-500 uppercase block">GDD (Base 5°C)</span>
                          <span className="text-xl font-black text-amber-600">
                            {(fieldWeather?.forecast_monthly || []).reduce((acc, w) => acc + w.gdd_accumulated, 0)} GDD
                          </span>
                        </div>
                      </div>

                      {/* 30-Day Temperature & Rainfall SVG Graph */}
                      <div className="bg-slate-50/90 border border-slate-200/90 rounded-2xl p-4 shadow-sm flex flex-col gap-2">
                        <div className="flex items-center justify-between mb-1">
                          <div>
                            <h4 className="text-sm font-extrabold text-slate-900">30-Day Climatological Projection</h4>
                            <p className="text-[11px] text-slate-500 font-medium">
                              Temperature band (Max/Min) and rainfall distribution over the next month
                            </p>
                          </div>
                          <div className="flex items-center gap-3 text-[10px] font-bold">
                            <span className="flex items-center gap-1 text-amber-600">
                              <span className="w-2.5 h-0.5 bg-amber-500 inline-block rounded" /> Max Temp
                            </span>
                            <span className="flex items-center gap-1 text-sky-600">
                              <span className="w-2.5 h-0.5 bg-sky-400 inline-block rounded" /> Min Temp
                            </span>
                            <span className="flex items-center gap-1 text-blue-700">
                              <span className="w-2 h-2 bg-blue-500 inline-block rounded-sm" /> Rain (mm)
                            </span>
                          </div>
                        </div>

                        {/* Responsive SVG Graph */}
                        <div className="w-full h-40 relative">
                          <svg viewBox="0 0 700 130" className="w-full h-full overflow-visible">
                            {/* Horizontal grid lines */}
                            <line x1="25" y1="20" x2="685" y2="20" stroke="#e2e8f0" strokeDasharray="3 3" />
                            <line x1="25" y1="55" x2="685" y2="55" stroke="#e2e8f0" strokeDasharray="3 3" />
                            <line x1="25" y1="90" x2="685" y2="90" stroke="#cbd5e1" strokeWidth="1.2" />

                            <text x="20" y="24" fill="#94a3b8" fontSize="8" textAnchor="end" fontWeight="bold">15°</text>
                            <text x="20" y="59" fill="#94a3b8" fontSize="8" textAnchor="end" fontWeight="bold">7°</text>
                            <text x="20" y="94" fill="#94a3b8" fontSize="8" textAnchor="end" fontWeight="bold">0°</text>

                            {/* Build temperature band & rain bars */}
                            {(() => {
                              const days = fieldWeather?.monthly_trend_days || [];
                              if (days.length === 0) return null;
                              const stepX = 660 / (days.length - 1);

                              let maxPath = '';
                              let minPath = '';
                              let bandPath = '';

                              days.forEach((d, i) => {
                                const x = 25 + i * stepX;
                                // Scale 0° to 16° on y from 90 to 15
                                const yMax = 90 - (d.temp_max / 16) * 75;
                                const yMin = 90 - (Math.max(0, d.temp_min) / 16) * 75;

                                if (i === 0) {
                                  maxPath += `M ${x} ${yMax}`;
                                  minPath += `M ${x} ${yMin}`;
                                  bandPath += `M ${x} ${yMax}`;
                                } else {
                                  maxPath += ` L ${x} ${yMax}`;
                                  minPath += ` L ${x} ${yMin}`;
                                  bandPath += ` L ${x} ${yMax}`;
                                }
                              });

                              // Close band path by reversing minPath
                              for (let i = days.length - 1; i >= 0; i--) {
                                const x = 25 + i * stepX;
                                const yMin = 90 - (Math.max(0, days[i].temp_min) / 16) * 75;
                                bandPath += ` L ${x} ${yMin}`;
                              }
                              bandPath += ' Z';

                              return (
                                <g>
                                  {/* Rain Bars at bottom */}
                                  {days.map((d, i) => {
                                    const x = 25 + i * stepX - 3;
                                    const barH = (d.precip_mm / 6) * 35;
                                    const y = 90 - barH;
                                    return (
                                      <rect
                                        key={`bar-${i}`}
                                        x={x}
                                        y={y}
                                        width={6}
                                        height={barH}
                                        fill="#0284c7"
                                        rx={1}
                                        opacity={0.8}
                                      />
                                    );
                                  })}

                                  {/* Shaded Temperature Band */}
                                  <path d={bandPath} fill="rgba(245, 158, 11, 0.14)" />

                                  {/* Max Temperature Line */}
                                  <path d={maxPath} fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />

                                  {/* Min Temperature Line */}
                                  <path d={minPath} fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />

                                  {/* X-axis date labels */}
                                  {days.filter((_, idx) => idx % 5 === 0).map((d, idx) => {
                                    const origIdx = idx * 5;
                                    const x = 25 + origIdx * stepX;
                                    return (
                                      <text
                                        key={`lbl-${idx}`}
                                        x={x}
                                        y="108"
                                        fill="#64748b"
                                        fontSize="9"
                                        textAnchor="middle"
                                        fontWeight="bold"
                                      >
                                        {d.label}
                                      </text>
                                    );
                                  })}
                                </g>
                              );
                            })()}
                          </svg>
                        </div>
                      </div>

                      {/* 4-Week Agricultural Outlook Cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                        {(fieldWeather?.forecast_monthly || []).map((w, i) => (
                          <div
                            key={`month-week-${i}`}
                            className="bg-slate-50/90 border border-slate-200/90 rounded-2xl p-3 flex flex-col justify-between gap-2 shadow-sm"
                          >
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-black text-slate-900">{w.week_label}</span>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                                  {w.avg_temp_c}°C avg
                                </span>
                              </div>
                              <span className="text-[10px] font-semibold text-slate-500 block">{w.date_range}</span>
                            </div>

                            <p className="text-[11px] text-slate-600 font-medium leading-snug">
                              {w.summary}
                            </p>

                            <div className="pt-2 border-t border-slate-200/80 flex flex-col gap-1 text-[10px] font-semibold text-slate-600">
                              <div className="flex justify-between">
                                <span>Rainfall total:</span>
                                <span className="font-bold text-slate-900">{w.total_precip_mm} mm</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Spraying suitability:</span>
                                <span className="font-bold text-[#1fa35b]">{w.spraying_suitability}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Frost risk:</span>
                                <span className="font-bold text-slate-700">{w.frost_risk}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 7. EXPANDED 3D SATELLITE MODAL */}
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

      {/* 8. VIRTUAL WEATHER STATIONS MANAGER MODAL */}
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
                        className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${station
                          ? 'bg-emerald-100 text-[#1fa35b]'
                          : 'bg-slate-100 text-slate-400'
                          }`}
                      >
                        <Radio size={16} />
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
