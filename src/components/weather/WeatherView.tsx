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
  ChevronUp,
  X,
  Play,
  Pause,
  Plus,
  RefreshCw,
  ExternalLink,
  Radio,
  Satellite,
  Sparkles,
} from 'lucide-react';
import {
  fetchAllFieldsWeather,
  fetchFieldWeather,
  toggleVirtualStation,
  type FieldWeatherSummary,
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
  const [fieldsSummary, setFieldsSummary] = useState<FieldWeatherSummary[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string>(initialFieldId || 'field-1');
  const [fieldWeather, setFieldWeather] = useState<FieldWeatherData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Layer switches: 'satellite' | 'ndvi' | 'weather' | 'clouds'
  const [activeLayer, setActiveLayer] = useState<'clouds' | 'weather' | 'ndvi' | 'satellite'>('clouds');

  // Sheet / Drawer collapse state
  const [sheetCollapsed, setSheetCollapsed] = useState<boolean>(false);
  const [chartHoursSpan, setChartHoursSpan] = useState<number>(6);
  const [hoveredChartPoint, setHoveredChartPoint] = useState<HourlyForecastPoint | null>(null);

  // Scrubber / Radar playback state
  const [radarIndex, setRadarIndex] = useState<number>(3); // Default to 'Now' (index 3 in 7 frames)
  const [isPlayingRadar, setIsPlayingRadar] = useState<boolean>(false);
  const playbackTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 3D Expand modal
  const [is3DExpanded, setIs3DExpanded] = useState<boolean>(false);

  // Add/Manage Station modal
  const [stationModalOpen, setStationModalOpen] = useState<boolean>(false);

  // 1. Initial Load of all fields summary
  const loadSummaries = useCallback(async () => {
    try {
      setRefreshing(true);
      const summaries = await fetchAllFieldsWeather();
      setFieldsSummary(summaries);
      if (summaries.length > 0 && !selectedFieldId) {
        setSelectedFieldId(summaries[0].field_id);
      }
    } catch (err) {
      console.error('Failed to load field summaries:', err);
    } finally {
      setRefreshing(false);
    }
  }, [selectedFieldId]);

  useEffect(() => {
    loadSummaries();
  }, [loadSummaries]);

  // 2. Load detailed weather for selected field
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
    return fieldsSummary.find((f) => f.field_id === selectedFieldId) || fieldsSummary[0];
  }, [fieldsSummary, selectedFieldId]);

  // Center position for map
  const mapCenter: [number, number] = useMemo(() => {
    if (fieldWeather?.coordinates) return fieldWeather.coordinates;
    if (currentSummary?.coordinates) return currentSummary.coordinates;
    return [52.415, 13.045];
  }, [fieldWeather, currentSummary]);

  // Toggle virtual weather station active status
  const handleToggleStation = async () => {
    if (!selectedFieldId || !fieldWeather) return;
    try {
      const nextActive = !fieldWeather.virtual_station.is_active;
      await toggleVirtualStation(selectedFieldId, nextActive);
      setFieldWeather((prev) =>
        prev
          ? {
              ...prev,
              virtual_station: { ...prev.virtual_station, is_active: nextActive },
            }
          : prev
      );
      loadSummaries();
    } catch (e) {
      console.error('Error toggling virtual station:', e);
    }
  };

  // Slice hourly forecast for chart
  const chartPoints = useMemo(() => {
    if (!fieldWeather?.forecast_hourly) return [];
    return fieldWeather.forecast_hourly.slice(0, chartHoursSpan + 1);
  }, [fieldWeather, chartHoursSpan]);

  // SVG Area Chart points builder with FieldShift AI brand green
  const chartSvgData = useMemo(() => {
    if (chartPoints.length < 2) return { path: '', area: '', points: [] };
    const width = 600;
    const height = 120;
    const padding = { top: 15, bottom: 25, left: 35, right: 25 };
    const graphW = width - padding.left - padding.right;
    const graphH = height - padding.top - padding.bottom;

    const points = chartPoints.map((pt, idx) => {
      const x = padding.left + (idx / (chartPoints.length - 1)) * graphW;
      const pct = Math.min(100, Math.max(0, pt.cloud_cover_percent));
      const y = padding.top + (1 - pct / 100) * graphH;
      return { x, y, pt };
    });

    const dPath = points.reduce((acc, p, i) => {
      return i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
    }, '');

    const areaPath = `${dPath} L ${points[points.length - 1].x} ${height - padding.bottom} L ${points[0].x} ${height - padding.bottom} Z`;

    return { path: dPath, area: areaPath, points };
  }, [chartPoints]);

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
                {currentSummary?.field_name || 'All fields'}
              </span>
              <ChevronDown size={14} className="text-slate-500" />
            </div>
            <span className="text-[11px] text-slate-500 font-medium">Season 2026</span>
          </div>

          <div className="h-5 w-[1px] bg-slate-200 mx-1" />

          {/* Quick Field Selector Dropdown */}
          <select
            value={selectedFieldId}
            onChange={(e) => setSelectedFieldId(e.target.value)}
            className="bg-transparent text-xs text-slate-700 font-semibold outline-none cursor-pointer pr-1"
          >
            {fieldsSummary.map((f) => (
              <option key={f.field_id} value={f.field_id} className="bg-white text-slate-800">
                {f.field_name} ({Math.round(f.temperature_c)}°C)
              </option>
            ))}
          </select>
        </div>

        {/* Add/Manage Virtual Station button */}
        <button
          onClick={() => setStationModalOpen(true)}
          className="bg-white/95 backdrop-blur-md hover:bg-slate-50 text-slate-800 border border-slate-200/90 rounded-2xl shadow-lg px-3 py-2.5 flex items-center gap-2 text-xs font-bold transition-all hover:scale-105 active:scale-95"
          title="Virtual Station Settings"
        >
          <Radio size={15} className="text-[#1fa35b] animate-pulse" />
          <span className="hidden sm:inline">Virtual Stations</span>
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
              ? 'bg-[#1fa35b] text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Satellite size={15} />
          <span className="hidden sm:inline">Satellite</span>
        </button>

        <button
          onClick={() => setActiveLayer('ndvi')}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
            activeLayer === 'ndvi'
              ? 'bg-[#1fa35b] text-white shadow-sm'
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
              ? 'bg-[#1fa35b] text-white shadow-sm'
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

      {/* 4. LEAFLET MAP & THREE.JS CLOUD SIMULATION */}
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

          {/* Field Boundary Polygons with glowing outlines */}
          {fieldsSummary.map((f) => {
            const isSelected = f.field_id === selectedFieldId;
            const geom = f.geometry || (fieldWeather?.field_id === f.field_id ? fieldWeather.geometry : null);
            if (!geom) return null;
            return (
              <GeoJSON
                key={`poly-${f.field_id}-${isSelected}`}
                data={{
                  type: 'Feature',
                  properties: { name: f.field_name },
                  geometry: geom,
                } as any}
                style={{
                  color: isSelected ? '#ffffff' : (activeLayer === 'ndvi' ? '#22c55e' : '#0284c7'),
                  weight: isSelected ? 3.5 : 2,
                  opacity: 0.95,
                  fillColor: activeLayer === 'ndvi' ? '#16a34a' : (isSelected ? '#1fa35b' : '#38bdf8'),
                  fillOpacity: activeLayer === 'ndvi' ? 0.45 : (isSelected ? 0.28 : 0.14),
                  dashArray: isSelected ? undefined : '4 2',
                }}
                eventHandlers={{
                  click: () => setSelectedFieldId(f.field_id),
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
                    setSheetCollapsed(false);
                  },
                }}
              />
            );
          })}
        </MapContainer>
      </div>

      {/* 5. RADAR TIMELINE SCRUBBER (Light Theme) */}
      <div className="absolute bottom-[375px] left-1/2 transform -translate-x-1/2 z-[500] w-[92%] max-w-xl transition-all">
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

      {/* 6. BOTTOM COLLAPSIBLE DRAWER (100% Light Theme, Flush with bottom edge) */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-[550] bg-white border-t border-slate-200 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] transition-all duration-300 rounded-t-3xl ${
          sheetCollapsed ? 'translate-y-[calc(100%-52px)]' : 'translate-y-0'
        }`}
      >
        {/* Drag Handle & Collapse Toggle Bar */}
        <div
          onClick={() => setSheetCollapsed(!sheetCollapsed)}
          className="flex items-center justify-between px-6 py-2.5 cursor-pointer border-b border-slate-200 bg-slate-50/90 rounded-t-3xl"
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-1 rounded-full bg-slate-300 mx-auto" />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700">
              {currentSummary?.field_name} Meteorological Intelligence
            </span>
            {sheetCollapsed ? <ChevronUp size={15} className="text-slate-500" /> : <ChevronDown size={15} className="text-slate-500" />}
          </div>

          <div className="w-6" />
        </div>

        {/* Content Body */}
        <div className="px-6 py-4 max-w-7xl mx-auto flex flex-col gap-4 max-h-[380px] overflow-y-auto bg-white">
          {/* Field Selection Pills & Actions */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              {fieldsSummary.map((f) => {
                const isSelected = f.field_id === selectedFieldId;
                return (
                  <button
                    key={`tab-${f.field_id}`}
                    onClick={() => setSelectedFieldId(f.field_id)}
                    className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      isSelected
                        ? 'bg-[#1fa35b] text-white shadow-sm'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                    }`}
                  >
                    {f.field_name}
                  </button>
                );
              })}

              <button
                onClick={() => setStationModalOpen(true)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 flex items-center gap-1.5 shadow-sm"
              >
                <Plus size={13} className="text-[#1fa35b]" />
                <span>Station Config</span>
              </button>
            </div>

            {onNavigateFieldAnalytics && (
              <button
                onClick={() => onNavigateFieldAnalytics(selectedFieldId)}
                className="text-xs font-bold text-[#1fa35b] hover:text-[#188a4c] flex items-center gap-1 hover:underline"
              >
                <span>Full Field Analytics</span>
                <ExternalLink size={13} />
              </button>
            )}
          </div>

          {/* 3 CORE CARDS ROW (Light Theme) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* CARD 1: Weather (Now) */}
            <div className="bg-slate-50/80 border border-slate-200/90 rounded-2xl p-4 flex flex-col justify-between shadow-sm relative overflow-hidden group">
              <div className="flex items-center justify-between text-xs text-slate-500 font-bold mb-2">
                <span>Weather (Now)</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold">
                  {fieldWeather?.virtual_station.is_active ? 'Station Online' : 'Standard'}
                </span>
              </div>

              <div className="flex items-center gap-4 my-1">
                {/* Weather condition icon */}
                <div className="w-12 h-12 rounded-2xl bg-amber-100/80 text-amber-600 flex items-center justify-center shadow-inner">
                  {fieldWeather?.current.icon === 'sunny' ? (
                    <Sun size={26} />
                  ) : fieldWeather?.current.icon === 'partly_cloudy' ? (
                    <CloudSun size={26} />
                  ) : (
                    <Cloud size={26} />
                  )}
                </div>

                <div className="flex flex-col">
                  <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                    {fieldWeather ? `${Math.round(fieldWeather.current.temperature_c)}°C` : '--'}
                  </span>
                  <span className="text-xs text-slate-600 font-semibold">
                    {fieldWeather?.current.condition || 'Clear sky'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-200 text-xs">
                <div className="flex items-center gap-1.5 text-slate-700 font-semibold">
                  <Wind size={14} className="text-slate-500" />
                  <span>
                    {fieldWeather ? `${Math.round(fieldWeather.current.wind_speed_ms)} m/s ${fieldWeather.current.wind_compass} ${fieldWeather.current.wind_arrow}` : '--'}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-slate-700 font-semibold">
                  <Droplets size={14} className="text-sky-600" />
                  <span>
                    {fieldWeather ? `${Math.round(fieldWeather.current.humidity_percent)}%` : '--'}
                  </span>
                </div>
              </div>
            </div>

            {/* CARD 2: Satellite (3-JS) */}
            <div className="bg-slate-50/80 border border-slate-200/90 rounded-2xl p-3 flex flex-col shadow-sm relative min-h-[160px]">
              <div className="flex items-center justify-between text-xs text-slate-700 font-bold mb-2 px-1">
                <div className="flex items-center gap-1.5">
                  <Sparkles size={14} className="text-[#1fa35b]" />
                  <span>Satellite (3-JS)</span>
                </div>
                <button
                  onClick={() => setIs3DExpanded(true)}
                  className="text-slate-500 hover:text-slate-800 transition-colors"
                  title="Expand 3D Model"
                >
                  <ExternalLink size={13} />
                </button>
              </div>

              <div className="flex-1 w-full rounded-xl overflow-hidden relative">
                <ThreeSatelliteViewer
                  fieldName={currentSummary?.field_name || 'Field 1'}
                  timestamp={fieldWeather?.current.observation_time || '10 Nov 2026, 10:24'}
                  simulationParams={fieldWeather?.threejs_simulation}
                  isExpanded={false}
                  onToggleExpand={() => setIs3DExpanded(true)}
                />
              </div>
            </div>

            {/* CARD 3: Clouds (Incoming) */}
            <div className="bg-slate-50/80 border border-slate-200/90 rounded-2xl p-4 flex flex-col justify-between shadow-sm">
              <div className="flex items-center justify-between text-xs text-slate-500 font-bold mb-1">
                <span>Clouds (Incoming)</span>
                <Cloud size={14} className="text-slate-400" />
              </div>

              <div className="my-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base font-extrabold text-slate-900">
                    {fieldWeather?.incoming_clouds.arrival_text || 'Clouds in ~45 min'}
                  </span>
                </div>
                <span className="text-xs text-slate-600 font-semibold">
                  {fieldWeather?.incoming_clouds.coverage_label || 'Coverage up to 70%'}
                </span>
              </div>

              {/* Hourly icons row */}
              <div className="grid grid-cols-4 gap-1 mt-3 pt-3 border-t border-slate-200">
                {(fieldWeather?.incoming_clouds.next_hours || [
                  { time: '14:30', icon: 'partly_cloudy' },
                  { time: '15:00', icon: 'cloudy' },
                  { time: '16:00', icon: 'cloudy' },
                  { time: '17:00', icon: 'cloudy' },
                ]).slice(0, 4).map((h, i) => (
                  <div key={i} className="flex flex-col items-center">
                    <div className="my-0.5">
                      {h.icon === 'sunny' ? (
                        <Sun size={15} className="text-amber-500" />
                      ) : h.icon === 'partly_cloudy' ? (
                        <CloudSun size={15} className="text-amber-400" />
                      ) : (
                        <Cloud size={15} className="text-slate-400" />
                      )}
                    </div>
                    <span className="text-[10px] text-slate-600 font-bold">{h.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* CLOUD COVER FORECAST AREA CHART (Light Theme) */}
          <div className="bg-slate-50/80 border border-slate-200/90 rounded-2xl p-4 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-800">
                Cloud cover forecast ({currentSummary?.field_name || 'Field 1'})
              </span>

              {/* Timeframe Selector */}
              <select
                value={chartHoursSpan}
                onChange={(e) => setChartHoursSpan(Number(e.target.value))}
                className="bg-white text-slate-700 text-xs font-bold rounded-lg px-2.5 py-1 border border-slate-200 outline-none cursor-pointer shadow-sm"
              >
                <option value={6}>Next 6 hours ▾</option>
                <option value={12}>Next 12 hours ▾</option>
                <option value={24}>Next 24 hours ▾</option>
              </select>
            </div>

            {/* SVG Curve Chart */}
            <div className="relative w-full h-36">
              <svg viewBox="0 0 600 120" className="w-full h-full overflow-visible">
                <defs>
                  {/* FieldShift AI Brand Green Light Gradient */}
                  <linearGradient id="cloudCurveGradLight" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1fa35b" stopOpacity="0.30" />
                    <stop offset="100%" stopColor="#1fa35b" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Horizontal Guide Lines */}
                <line x1="35" y1="15" x2="575" y2="15" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 3" />
                <line x1="35" y1="40" x2="575" y2="40" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 3" />
                <line x1="35" y1="65" x2="575" y2="65" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 3" />
                <line x1="35" y1="95" x2="575" y2="95" stroke="#cbd5e1" strokeWidth="1.2" />

                {/* Left Y-axis labels */}
                <text x="30" y="18" fill="#64748b" fontSize="9" textAnchor="end" fontWeight="700">100%</text>
                <text x="30" y="43" fill="#64748b" fontSize="9" textAnchor="end" fontWeight="700">75%</text>
                <text x="30" y="68" fill="#64748b" fontSize="9" textAnchor="end" fontWeight="700">50%</text>
                <text x="30" y="98" fill="#64748b" fontSize="9" textAnchor="end" fontWeight="700">0%</text>

                {/* Area fill */}
                {chartSvgData.area && (
                  <path d={chartSvgData.area} fill="url(#cloudCurveGradLight)" />
                )}

                {/* Main line */}
                {chartSvgData.path && (
                  <path d={chartSvgData.path} fill="none" stroke="#1fa35b" strokeWidth="2.5" strokeLinecap="round" />
                )}

                {/* Vertical "Now" line & Badge */}
                {chartSvgData.points.length > 0 && (
                  <g>
                    <line
                      x1={chartSvgData.points[0].x + 35}
                      y1="15"
                      x2={chartSvgData.points[0].x + 35}
                      y2="95"
                      stroke="#475569"
                      strokeWidth="1.2"
                      strokeDasharray="4 4"
                    />
                    <rect
                      x={chartSvgData.points[0].x + 12}
                      y="1"
                      width="46"
                      height="20"
                      rx="4"
                      fill="#ffffff"
                      stroke="#cbd5e1"
                      strokeWidth="1"
                      filter="drop-shadow(0 1px 2px rgba(0,0,0,0.08))"
                    />
                    <text
                      x={chartSvgData.points[0].x + 35}
                      y="10"
                      fill="#64748b"
                      fontSize="7.5"
                      textAnchor="middle"
                      fontWeight="bold"
                    >
                      Now
                    </text>
                    <text
                      x={chartSvgData.points[0].x + 35}
                      y="18"
                      fill="#0f172a"
                      fontSize="8"
                      textAnchor="middle"
                      fontWeight="black"
                    >
                      {fieldWeather?.current.observation_time || '14:39'}
                    </text>
                  </g>
                )}

                {/* Points on curve */}
                {chartSvgData.points.map((p, idx) => (
                  <g key={`pt-${idx}`} className="cursor-pointer">
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r="4"
                      fill="#ffffff"
                      stroke="#1fa35b"
                      strokeWidth="2.5"
                      className="hover:r-6 transition-all"
                      onMouseEnter={() => setHoveredChartPoint(p.pt)}
                      onMouseLeave={() => setHoveredChartPoint(null)}
                    />
                    {/* Time labels under chart */}
                    <text
                      x={p.x}
                      y="112"
                      fill="#64748b"
                      fontSize="9"
                      textAnchor="middle"
                      fontWeight="700"
                    >
                      {p.pt.time}
                    </text>
                  </g>
                ))}
              </svg>

              {/* Hover Tooltip */}
              {hoveredChartPoint && (
                <div className="absolute top-2 right-4 bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-xs shadow-lg pointer-events-none">
                  <div className="text-slate-900 font-extrabold">{hoveredChartPoint.time}</div>
                  <div className="text-[#1fa35b] font-bold">Cloud cover: {hoveredChartPoint.cloud_cover_percent}%</div>
                  <div className="text-slate-600 font-semibold">Temp: {hoveredChartPoint.temperature_c}°C</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 7. EXPANDED 3D SATELLITE MODAL (Light Theme) */}
      {is3DExpanded && (
        <div className="fixed inset-0 z-[1000] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="relative w-full max-w-4xl h-[80vh] bg-white border border-slate-200 rounded-3xl overflow-hidden flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-[#1fa35b]" />
                <h3 className="text-base font-extrabold text-slate-900">
                  3D Satellite Surface Simulation • {currentSummary?.field_name}
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
                fieldName={currentSummary?.field_name}
                timestamp={fieldWeather?.current.observation_time || '10 Nov 2026, 10:24'}
                simulationParams={fieldWeather?.threejs_simulation}
                isExpanded={true}
                onToggleExpand={() => setIs3DExpanded(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* 8. VIRTUAL WEATHER STATION MODAL (Light Theme) */}
      {stationModalOpen && (
        <div className="fixed inset-0 z-[1000] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Radio size={18} className="text-[#1fa35b] animate-pulse" />
                <h3 className="text-base font-extrabold text-slate-900">Virtual Weather Station</h3>
              </div>
              <button
                onClick={() => setStationModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-3 text-xs text-slate-600">
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 flex items-center justify-between">
                <div>
                  <div className="font-extrabold text-slate-900 text-sm">
                    {fieldWeather?.virtual_station.station_name || 'Virtual Station'}
                  </div>
                  <div className="text-[11px] text-slate-500 font-medium">
                    Field: {currentSummary?.field_name} • Lat {(fieldWeather?.coordinates?.[0] ?? currentSummary?.coordinates?.[0] ?? 52.415).toFixed(4)}, Lon {(fieldWeather?.coordinates?.[1] ?? currentSummary?.coordinates?.[1] ?? 13.045).toFixed(4)}
                  </div>
                </div>
                <button
                  onClick={handleToggleStation}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                    fieldWeather?.virtual_station.is_active
                      ? 'bg-[#1fa35b] hover:bg-[#188a4c] text-white shadow-sm'
                      : 'bg-slate-200 hover:bg-slate-300 text-slate-600'
                  }`}
                >
                  {fieldWeather?.virtual_station.is_active ? 'Active' : 'Disabled'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 block mb-0.5 font-bold uppercase">Hardware Model</span>
                  <span className="font-bold text-slate-900">vStation Pro AgriMesh</span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 block mb-0.5 font-bold uppercase">Sensors Sync</span>
                  <span className="font-bold text-[#1fa35b]">Real-time Open-Meteo & NASA</span>
                </div>
              </div>

              <p className="text-[11px] text-slate-600 leading-relaxed font-medium">
                Virtual weather stations extrapolate local microclimates directly over your field centroid
                using satellite and meteorological mesh networks. They provide hyper-localized wind,
                cloud, and precipitation alerts.
              </p>
            </div>

            <button
              onClick={() => setStationModalOpen(false)}
              className="w-full py-2.5 bg-[#1fa35b] hover:bg-[#188a4c] text-white font-bold text-xs rounded-xl transition-colors shadow-md"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
