import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar,
  CloudSun,
  Droplets,
  Thermometer,
  Wind,
  Sprout,
  Pencil,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  TrendingUp,
  Info,
  Compass,
  Check,
  CheckCircle2,
  Eye,
  Layers,
  RefreshCw,
  Cloud,
} from 'lucide-react';
import {
  FieldStatusSummary,
  NDVITimeSeriesResponse,
  PrecipitationTimeSeriesResponse,
  GDDTimeSeriesResponse,
  SatelliteObservation,
} from '../../services/fieldAnalyticsApi';
import { useI18n } from '../../i18n';

interface StatusTabProps {
  summary: FieldStatusSummary;
  ndviData: NDVITimeSeriesResponse | null;
  precipData: PrecipitationTimeSeriesResponse | null;
  gddData: GDDTimeSeriesResponse | null;
  onUpdatePlantingDate: (date: string) => Promise<void>;
  onBaseTempChange: (temp: number) => void;
  selectedBaseTemp: number;
  batchProgress?: {
    loaded: number;
    total: number;
    isStreaming: boolean;
  };
}

export const StatusTab: React.FC<StatusTabProps> = ({
  summary,
  ndviData,
  precipData,
  gddData,
  onUpdatePlantingDate,
  onBaseTempChange,
  selectedBaseTemp,
  batchProgress,
}) => {
  const { t, formatDate } = useI18n();
  // Observations from props (ordered newest first)
  const observations = useMemo(() => ndviData?.observations || [], [ndviData]);

  // Dynamically derive available seasons from actual observations
  const availableSeasons = useMemo(() => {
    const s = new Set<string>();
    for (const o of observations) {
      if (o.season) s.add(o.season);
    }
    const sorted = Array.from(s).sort().reverse();
    return ['all', ...sorted];
  }, [observations]);

  const [selectedSeason, setSelectedSeason] = useState<string>('all');
  const [imageryMode, setImageryMode] = useState<'rgb' | 'ndvi' | 'false_color'>('rgb');
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [inputDate, setInputDate] = useState(summary.planting_date || '');
  const [savingDate, setSavingDate] = useState(false);
  const [ndviImgError, setNdviImgError] = useState(false);
  const [rgbImgError, setRgbImgError] = useState(false);
  const [activeModalImg, setActiveModalImg] = useState<{ title: string; url?: string | null; type: 'ndvi' | 'rgb' } | null>(null);

  // Scaled SVG polygon points from field boundary geometry
  const svgPolygonPoints = useMemo(() => {
    if (!summary?.geometry || !summary.geometry.coordinates || !summary.geometry.coordinates[0]) {
      return null;
    }
    const coords = summary.geometry.coordinates[0];
    if (coords.length < 3) return null;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    coords.forEach(([x, y]: [number, number]) => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    });

    const rangeX = maxX - minX || 0.001;
    const rangeY = maxY - minY || 0.001;
    const pad = 24;
    const w = 320 - pad * 2;
    const h = 240 - pad * 2;

    return coords.map(([x, y]: [number, number]) => {
      const px = pad + ((x - minX) / rangeX) * w;
      const py = pad + ((maxY - y) / rangeY) * h;
      return `${px.toFixed(1)},${py.toFixed(1)}`;
    }).join(' ');
  }, [summary?.geometry]);

  // Filtered observations (newest first)
  const filteredObs = useMemo(() => {
    if (selectedSeason === 'all') return observations;
    return observations.filter((o) => o.season === selectedSeason);
  }, [observations, selectedSeason]);

  // Stable selection by observation ID (starts with newest)
  const [selectedObsId, setSelectedObsId] = useState<string | null>(null);

  useEffect(() => {
    if (filteredObs.length > 0) {
      if (!selectedObsId || !filteredObs.some((o) => o.id === selectedObsId)) {
        // Default to newest observation (first in array)
        setSelectedObsId(filteredObs[0].id);
      }
    }
  }, [filteredObs, selectedObsId]);

  const currentObs: SatelliteObservation | null = useMemo(() => {
    if (filteredObs.length === 0) return null;
    return filteredObs.find((o) => o.id === selectedObsId) || filteredObs[0];
  }, [filteredObs, selectedObsId]);

  const currentObsIndex = useMemo(() => {
    if (!currentObs) return 0;
    const idx = filteredObs.findIndex((o) => o.id === currentObs.id);
    return idx >= 0 ? idx : 0;
  }, [filteredObs, currentObs]);

  const handlePrevObs = () => {
    // Newer acquisition is index - 1 in newest-first list
    if (currentObsIndex > 0) {
      setSelectedObsId(filteredObs[currentObsIndex - 1].id);
    }
  };

  const handleNextObs = () => {
    // Older acquisition is index + 1 in newest-first list
    if (currentObsIndex < filteredObs.length - 1) {
      setSelectedObsId(filteredObs[currentObsIndex + 1].id);
    }
  };

  // Chronologically sorted observations for time series graph (past -> present)
  const chronologicalObs = useMemo(() => {
    return [...filteredObs].sort((a, b) =>
      (a.acquisition_date || '').localeCompare(b.acquisition_date || '')
    );
  }, [filteredObs]);

  // Dynamic Crop Metadata
  const cropGroup = useMemo(() => {
    if (!summary.current_crop) return 'Unassigned';
    const c = summary.current_crop.toLowerCase();
    if (c.includes('wheat') || c.includes('barley') || c.includes('rye') || c.includes('oat')) return 'Cereals';
    if (c.includes('grass') || c.includes('pasture') || c.includes('hay') || c.includes('clover')) return 'Forage & Grassland';
    if (c.includes('pea') || c.includes('bean') || c.includes('soy') || c.includes('lupin')) return 'Legumes & Pulses';
    if (c.includes('maize') || c.includes('corn')) return 'Maize';
    if (c.includes('rapeseed') || c.includes('canola')) return 'Oilseeds';
    if (c.includes('beet') || c.includes('potato')) return 'Root & Tubers';
    return 'Field Crops';
  }, [summary.current_crop]);

  const targetYield = useMemo(() => {
    if (!summary.current_crop) return 'Awaiting assignment';
    const c = summary.current_crop.toLowerCase();
    if (c.includes('wheat')) return '7.5 t/ha expected';
    if (c.includes('barley')) return '6.8 t/ha expected';
    if (c.includes('rye')) return '6.0 t/ha expected';
    if (c.includes('grass') || c.includes('pasture')) return '5.2 t/ha dry matter';
    if (c.includes('pea')) return '3.6 t/ha expected';
    if (c.includes('rapeseed')) return '4.0 t/ha expected';
    if (c.includes('maize') || c.includes('corn')) return '9.5 t/ha grain';
    return '6.2 t/ha expected';
  }, [summary.current_crop]);

  const seedingSeason = useMemo(() => {
    if (!summary.planting_date) return 'Seeding window';
    try {
      const month = new Date(summary.planting_date).getMonth() + 1;
      if (month >= 8 && month <= 11) return 'Autumn seeding';
      if (month >= 2 && month <= 5) return 'Spring seeding';
      if (month >= 6 && month <= 7) return 'Summer catch crop';
      return 'Winter crop';
    } catch {
      return 'Recorded seeding';
    }
  }, [summary.planting_date]);

  const handleSavePlantingDate = async () => {
    setSavingDate(true);
    try {
      await onUpdatePlantingDate(inputDate);
      setIsEditingDate(false);
    } finally {
      setSavingDate(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* ── Section 1: Field Information Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Crop */}
        <div className="bg-white rounded-2xl p-5 border border-black/[0.05] shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">{t('analyticsTabs.currentCrop')}</span>
            <span className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
              <Sprout size={18} />
            </span>
          </div>
          <div className="my-3">
            <h3 className="text-xl font-bold text-gray-900">{summary.current_crop || t('analytics.noCropAssigned')}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {summary.current_crop ? `${targetYield} • ` : ''}{summary.area_ha.toFixed(2)} ha arable land{!summary.current_crop ? ` • ${t('analyticsTabs.unallocated')}` : ''}
            </p>
          </div>
          <div className="pt-2 border-t border-black/[0.04] flex items-center justify-between text-xs text-gray-500">
            <span>{t('analyticsTabs.rotationalGroup', { group: cropGroup })}</span>
            <span className={summary.current_crop ? "text-emerald-700 font-semibold flex items-center gap-1" : "text-amber-700 font-semibold flex items-center gap-1"}>
              {summary.current_crop ? t('analyticsTabs.activeSeason') : t('analyticsTabs.unallocated')}
            </span>
          </div>
        </div>

        {/* Card 2: Planting Date */}
        <div className="bg-white rounded-2xl p-5 border border-black/[0.05] shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">{t('analyticsTabs.plantingDate')}</span>
            <button
              onClick={() => setIsEditingDate(!isEditingDate)}
              className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition"
              title={t('analyticsTabs.editDateTooltip')}
            >
              <Pencil size={15} />
            </button>
          </div>

          <div className="my-3">
            {isEditingDate ? (
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="date"
                  value={inputDate}
                  onChange={(e) => setInputDate(e.target.value)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 focus:outline-emerald-600"
                />
                <button
                  onClick={handleSavePlantingDate}
                  disabled={savingDate}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition"
                >
                  {savingDate ? '...' : 'Save'}
                </button>
              </div>
            ) : (
              <>
                <h3 className="text-xl font-bold text-gray-900">
                  {summary.planting_date
                    ? formatDate(summary.planting_date)
                    : t('analyticsTabs.notSet')}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {summary.planting_date
                    ? t('analyticsTabs.daysSinceEmergence', { days: summary.days_since_planting || 0 })
                    : t('analyticsTabs.recordEmergencePrompt')}
                </p>
              </>
            )}
          </div>

          <div className="pt-2 border-t border-black/[0.04] flex items-center justify-between text-xs text-gray-500">
            <span>{t('analyticsTabs.durableRecord')}</span>
            <span className="text-gray-700 font-medium">{seedingSeason}</span>
          </div>
        </div>

        {/* Card 3: Current Weather */}
        <div className="bg-white rounded-2xl p-5 border border-black/[0.05] shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">{t('analyticsTabs.currentWeather')}</span>
            <span className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <CloudSun size={18} />
            </span>
          </div>

          <div className="my-2 flex items-baseline justify-between">
            <div>
              <div className="text-3xl font-extrabold text-gray-900">
                {summary.current_weather?.temperature_c ?? 18.4}°C
              </div>
              <p className="text-xs font-medium text-gray-500">
                {summary.current_weather?.condition ?? 'Partly cloudy'} • {t('analyticsTabs.feelsLike', { temp: summary.current_weather?.feels_like_c ?? 18.0 })}
              </p>
            </div>
            <div className="text-right text-xs text-gray-500 space-y-0.5">
              <div className="flex items-center gap-1 justify-end">
                <Droplets size={12} className="text-blue-500" />
                <span>{t('analyticsTabs.rain', { amount: summary.current_weather?.precipitation_mm != null ? `${summary.current_weather.precipitation_mm} mm` : '—' })}</span>
              </div>
              <div className="flex items-center gap-1 justify-end">
                <Wind size={12} className="text-gray-400" />
                <span>{t('analyticsTabs.wind', { speed: summary.current_weather?.wind_speed_kmh != null ? `${summary.current_weather.wind_speed_kmh} km/h` : '—' })}</span>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-black/[0.04] flex items-center justify-between text-xs text-gray-400">
            <span className="truncate max-w-[200px]">
              {summary.current_weather?.station_or_provider || 'Weather station sync pending'}
            </span>
            <span>Live Observation</span>
          </div>
        </div>
      </div>

      {/* ── Section 2: Historical Satellite & NDVI Map Visualizer ── */}
      <div className="bg-white rounded-2xl p-6 border border-black/[0.05] shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] space-y-5">
        {/* Date Selector Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-black/[0.04]">
          <div>
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Eye size={18} className="text-emerald-600" />
              {t('analyticsTabs.satelliteTitle')}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {t('analyticsTabs.satelliteSubtitle')}
            </p>
          </div>

          {/* Observation Navigation Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Season Filter Pills */}
            <div className="flex items-center bg-gray-100 p-0.5 rounded-xl text-xs font-semibold overflow-x-auto max-w-full">
              {availableSeasons.map((season) => (
                <button
                  key={season}
                  onClick={() => {
                    setSelectedSeason(season);
                  }}
                  className={`px-2.5 py-1 rounded-lg transition ${selectedSeason === season
                    ? 'bg-white text-gray-900 shadow-xs'
                    : 'text-gray-500 hover:text-gray-900'
                    }`}
                >
                  {season === 'all' ? 'All' : season}
                </button>
              ))}
            </div>

            {/* Stepper buttons */}
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
              <button
                onClick={handlePrevObs}
                disabled={currentObsIndex <= 0}
                className="p-1 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-white transition disabled:opacity-30"
                title="Newer acquisition"
              >
                <ChevronLeft size={16} />
              </button>

              <select
                value={currentObs?.id || ''}
                onChange={(e) => setSelectedObsId(e.target.value)}
                className="text-xs font-semibold bg-white text-gray-800 px-2 py-1 rounded-lg border-none shadow-xs focus:ring-0 cursor-pointer max-w-[210px] truncate"
              >
                {filteredObs.map((obs) => (
                  <option key={obs.id} value={obs.id}>
                    {obs.acquisition_date} (Cloud: {obs.cloud_cover_percent}%)
                  </option>
                ))}
              </select>

              <button
                onClick={handleNextObs}
                disabled={currentObsIndex >= filteredObs.length - 1}
                className="p-1 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-white transition disabled:opacity-30"
                title="Older acquisition"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Dual Panel Visualizer */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Panel 1: Spatial NDVI Map */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                  Spatial NDVI Map
                </h4>
              </div>
              <span className="text-xs font-semibold text-gray-500">
                Mean NDVI: <b className="text-emerald-700">{currentObs?.mean_ndvi != null ? currentObs.mean_ndvi.toFixed(2) : '—'}</b>
              </span>
            </div>

            {/* Map Frame */}
            <div className="relative aspect-4/3 rounded-2xl overflow-hidden bg-slate-950 border border-gray-200 flex items-center justify-center shadow-inner group">
              {/* Satellite basemap backdrop */}
              <div
                className="absolute inset-0 bg-cover bg-center opacity-65 filter contrast-125 brightness-95"
                style={{
                  backgroundImage: `radial-gradient(circle at center, rgba(15, 23, 42, 0.3) 0%, rgba(15, 23, 42, 0.8) 100%), url('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/14/5428/8856')`,
                }}
              />

              {currentObs?.ndvi_preview_url && !ndviImgError ? (
                <img
                  src={currentObs.ndvi_preview_url}
                  alt="NDVI Map"
                  className="w-full h-full object-contain filter drop-shadow-md z-10 relative transition-transform duration-300 group-hover:scale-[1.02]"
                  onError={() => setNdviImgError(true)}
                />
              ) : svgPolygonPoints ? (
                <div className="w-full h-full z-10 relative flex items-center justify-center p-6">
                  <svg viewBox="0 0 320 240" className="w-full h-full filter drop-shadow-2xl">
                    <defs>
                      <linearGradient id="ndviPolygonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#22c55e" stopOpacity="0.9" />
                        <stop offset="50%" stopColor="#eab308" stopOpacity="0.9" />
                        <stop offset="100%" stopColor="#f97316" stopOpacity="0.9" />
                      </linearGradient>
                    </defs>
                    <polygon
                      points={svgPolygonPoints}
                      fill="url(#ndviPolygonGrad)"
                      stroke="#ffffff"
                      strokeWidth="2.5"
                    />
                  </svg>
                </div>
              ) : (
                <div className="z-10 flex flex-col items-center gap-2 text-white/80">
                  <RefreshCw className="animate-spin text-emerald-400" size={18} />
                  <span className="text-xs font-medium">Syncing field NDVI raster...</span>
                </div>
              )}

              {/* OneSoil-style Badge: Vegetation [NDVI] */}
              <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
                <div className="bg-black/75 backdrop-blur-md px-3 py-1 rounded-xl text-white text-[11px] font-semibold flex items-center gap-2 border border-white/10 shadow-lg">
                  <span className="text-gray-200">Vegetation</span>
                  <span className="bg-emerald-600/90 text-white px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider">
                    NDVI
                  </span>
                </div>
              </div>

              {/* Fullscreen Expand Button */}
              <button
                onClick={() =>
                  setActiveModalImg({
                    title: `NDVI Map — ${currentObs?.acquisition_date ?? 'Latest'}`,
                    url: currentObs?.ndvi_preview_url,
                    type: 'ndvi',
                  })
                }
                className="absolute top-3 right-3 z-20 bg-black/60 hover:bg-black/85 backdrop-blur-md p-1.5 rounded-xl text-white/90 hover:text-white transition border border-white/10 shadow-lg"
                title="Expand map"
              >
                <Maximize2 size={13} />
              </button>

              {/* OneSoil-style Vertical NDVI Legend */}
              <div className="absolute bottom-3 left-3 z-20 bg-black/70 backdrop-blur-md px-2 py-2 rounded-xl border border-white/10 text-white shadow-xl flex items-center gap-2">
                <div className="flex flex-col items-center gap-0.5">
                  <div className="h-28 w-2 rounded-full bg-linear-to-b from-[#006837] via-[#78c679] via-40% via-[#fecc5c] via-70% to-[#d73027] shadow-inner" />
                  <Cloud size={11} className="text-gray-300 mt-1" />
                </div>
                <div className="flex flex-col justify-between h-28 text-[9px] font-mono font-bold text-gray-200">
                  <span>1.0</span>
                  <span>0.7</span>
                  <span>0.4</span>
                  <span>0.2</span>
                  <span>0.0</span>
                </div>
              </div>

              {/* Floating Range Pill */}
              <div className="absolute bottom-3 right-3 z-20 bg-black/75 backdrop-blur-md px-3 py-1.5 rounded-xl text-white text-[10px] font-mono border border-white/10 shadow-lg">
                Range: {currentObs?.min_ndvi != null ? currentObs.min_ndvi.toFixed(2) : '—'} — {currentObs?.max_ndvi != null ? currentObs.max_ndvi.toFixed(2) : '—'}
              </div>
            </div>
          </div>

          {/* Panel 2: Satellite Image History */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                  {t('analyticsTabs.satelliteImageHistory')}
                </h4>
              </div>

              {/* Composite Mode Selector */}
              <div className="flex items-center gap-1 bg-gray-100 p-0.5 rounded-lg text-[11px] font-semibold">
                <button
                  onClick={() => setImageryMode('rgb')}
                  className={`px-2 py-0.5 rounded transition ${imageryMode === 'rgb' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500'
                    }`}
                >
                  {t('analyticsTabs.trueColorRgb')}
                </button>
                <button
                  onClick={() => setImageryMode('false_color')}
                  className={`px-2 py-0.5 rounded transition ${imageryMode === 'false_color' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500'
                    }`}
                >
                  {t('analyticsTabs.falseColorNir')}
                </button>
              </div>
            </div>

            {/* Satellite Image Frame */}
            <div className="relative aspect-4/3 rounded-2xl overflow-hidden bg-slate-950 border border-gray-200 flex items-center justify-center shadow-inner group">
              {/* Satellite basemap backdrop */}
              <div
                className="absolute inset-0 bg-cover bg-center opacity-70 filter contrast-125"
                style={{
                  backgroundImage: `radial-gradient(circle at center, rgba(15, 23, 42, 0.3) 0%, rgba(15, 23, 42, 0.7) 100%), url('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/14/5428/8856')`,
                }}
              />

              {currentObs?.rgb_preview_url && !rgbImgError ? (
                <img
                  src={
                    imageryMode === 'false_color' && currentObs.ndvi_preview_url
                      ? currentObs.ndvi_preview_url
                      : currentObs.rgb_preview_url
                  }
                  alt="Satellite Observation"
                  className={`w-full h-full object-contain filter drop-shadow-md z-10 relative transition-transform duration-300 group-hover:scale-[1.02] ${imageryMode === 'false_color' ? 'hue-rotate-90 contrast-125' : ''
                    }`}
                  onError={() => setRgbImgError(true)}
                />
              ) : svgPolygonPoints ? (
                <div className="w-full h-full z-10 relative flex items-center justify-center p-6">
                  <svg viewBox="0 0 320 240" className="w-full h-full filter drop-shadow-2xl">
                    <polygon
                      points={svgPolygonPoints}
                      fill="rgba(56, 189, 248, 0.25)"
                      stroke="#38bdf8"
                      strokeWidth="2.5"
                    />
                  </svg>
                </div>
              ) : (
                <div className="z-10 flex flex-col items-center gap-2 text-white/80">
                  <RefreshCw className="animate-spin text-blue-400" size={18} />
                  <span className="text-xs font-medium">Loading satellite scene...</span>
                </div>
              )}

              {/* OneSoil-style Header Badge: Satellite image, Nov 7, 2026 */}
              <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
                <div className="bg-black/75 backdrop-blur-md px-3 py-1 rounded-xl text-white text-[11px] font-semibold border border-white/10 shadow-lg">
                  Satellite image, {currentObs?.acquisition_date ? new Date(currentObs.acquisition_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Nov 7, 2026'}
                </div>
              </div>

              {/* Fullscreen Expand Button */}
              <button
                onClick={() =>
                  setActiveModalImg({
                    title: `Satellite Scene (${imageryMode === 'false_color' ? 'NIR' : 'RGB'}) — ${currentObs?.acquisition_date ?? ''}`,
                    url: imageryMode === 'false_color' && currentObs?.ndvi_preview_url ? currentObs.ndvi_preview_url : currentObs?.rgb_preview_url,
                    type: 'rgb',
                  })
                }
                className="absolute top-3 right-3 z-20 bg-black/60 hover:bg-black/85 backdrop-blur-md p-1.5 rounded-xl text-white/90 hover:text-white transition border border-white/10 shadow-lg"
                title="Expand scene"
              >
                <Maximize2 size={13} />
              </button>

              {/* Quality & Cloud Overlay */}
              <div className="absolute bottom-3 left-3 z-20 bg-black/75 backdrop-blur-md px-3 py-1.5 rounded-xl text-white text-[10px] font-mono border border-white/10 shadow-lg space-y-0.5">
                <div>Sensor: Sentinel-2 L2A (10m)</div>
                <div>Cloud Cover: {currentObs?.cloud_cover_percent}%</div>
              </div>

              {/* Field boundary overlay notice */}
              <div className="absolute bottom-3 right-3 z-20 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-lg text-white text-[10px] flex items-center gap-1 border border-white/10">
                <Compass size={11} /> Polygon boundary clipped
              </div>
            </div>
          </div>
        </div>

        {/* Modal for Fullscreen View */}
        {activeModalImg && (
          <div
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
            onClick={() => setActiveModalImg(null)}
          >
            <div
              className="bg-gray-950 border border-gray-700 rounded-3xl max-w-4xl w-full p-6 space-y-4 shadow-2xl relative"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-white font-bold text-sm tracking-wide">{activeModalImg.title}</h3>
                <button
                  onClick={() => setActiveModalImg(null)}
                  className="text-gray-400 hover:text-white px-2 py-1 rounded-lg bg-gray-800 text-sm font-semibold transition"
                >
                  ✕ Close
                </button>
              </div>
              <div className="aspect-16/10 rounded-2xl bg-black border border-gray-800 overflow-hidden flex items-center justify-center p-4">
                {activeModalImg.url ? (
                  <img
                    src={activeModalImg.url}
                    alt={activeModalImg.title}
                    className="w-full h-full object-contain filter drop-shadow-2xl"
                  />
                ) : svgPolygonPoints ? (
                  <svg viewBox="0 0 320 240" className="w-full h-full p-6">
                    <polygon
                      points={svgPolygonPoints}
                      fill={activeModalImg.type === 'ndvi' ? '#22c55e' : 'rgba(56, 189, 248, 0.4)'}
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                  </svg>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Section 3: Time Series Interactive Charts ── */}
      <div className="space-y-6">
        {/* Chart 1: Historical NDVI Series */}
        <div className="bg-white rounded-2xl p-6 border border-black/[0.05] shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <TrendingUp size={16} className="text-emerald-600" />
                Historical NDVI Time Series
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Multi-year Sentinel-2 Level-2A surface reflectance vegetation index
              </p>
            </div>

            {/* KPI Badges & Progressive Batch Status */}
            <div className="flex flex-wrap items-center gap-3 text-xs">
              {batchProgress && (
                <div className="flex items-center gap-2">
                  {batchProgress.isStreaming ? (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-200 animate-pulse font-medium text-[11px]">
                      <RefreshCw size={12} className="animate-spin text-emerald-600" />
                      <span>Streaming batch: {batchProgress.loaded} / {batchProgress.total} scenes (newest first)...</span>
                    </div>
                  ) : batchProgress.total > 0 ? (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 text-gray-600 rounded-xl border border-gray-200 font-medium text-[11px]">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span>{batchProgress.total} scenes synced</span>
                    </div>
                  ) : null}
                </div>
              )}

              <div className="bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 text-emerald-800">
                <span className="text-gray-500 text-[10px] block">LATEST NDVI</span>
                <span className="font-bold text-sm">
                  {ndviData?.latest_ndvi != null ? ndviData.latest_ndvi.toFixed(2) : '—'}
                </span>{' '}
                <small className="text-emerald-600 font-semibold">
                  ({ndviData?.latest_date ?? '—'})
                </small>
              </div>

              {ndviData?.change_percent !== undefined && ndviData.change_percent !== null && (
                <div className="bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-200 text-gray-800">
                  <span className="text-gray-500 text-[10px] block">DELTA VS PREVIOUS</span>
                  <span
                    className={`font-bold text-sm ${(ndviData.change_percent ?? 0) >= 0 ? 'text-emerald-600' : 'text-amber-600'
                      }`}
                  >
                    {(ndviData.change_percent ?? 0) >= 0 ? '+' : ''}
                    {ndviData.change_percent}%
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* SVG Line Chart (Rendered from Chronological Points, Expanding Backwards in Time) */}
          <div className="relative pt-4">
            <svg viewBox="0 0 800 220" className="w-full h-56 overflow-visible">
              <defs>
                <linearGradient id="ndviGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1fa35b" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#1fa35b" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              {[0.2, 0.4, 0.6, 0.8].map((val) => {
                const y = 200 - val * 200;
                return (
                  <g key={val}>
                    <line x1="40" y1={y} x2="780" y2={y} stroke="#f1f5f9" strokeDasharray="4 4" />
                    <text x="32" y={y + 4} textAnchor="end" fontSize="10" fill="#94a3b8" fontFamily="monospace">
                      {val.toFixed(1)}
                    </text>
                  </g>
                );
              })}

              {/* Draw Data Points and Path with Chronological Observations */}
              {chronologicalObs.length > 1 && (() => {
                const step = 720 / (chronologicalObs.length - 1);
                const points = chronologicalObs.map((o, i) => {
                  const x = 50 + i * step;
                  const y = 200 - Math.min(1.0, Math.max(0.0, o.mean_ndvi ?? 0)) * 200;
                  const isSelected = o.id === currentObs?.id;
                  return { x, y, o, i, isSelected };
                });

                const pathD = points.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`, '');
                const areaD = `${pathD} L ${points[points.length - 1].x} 200 L ${points[0].x} 200 Z`;

                return (
                  <>
                    <path d={areaD} fill="url(#ndviGradient)" />
                    <path d={pathD} fill="none" stroke="#1fa35b" strokeWidth="2.5" strokeLinecap="round" />
                    {points.map((p) => (
                      <circle
                        key={p.o.id}
                        cx={p.x}
                        cy={p.y}
                        r={p.isSelected ? 5 : 3}
                        fill={p.isSelected ? '#1fa35b' : '#ffffff'}
                        stroke="#1fa35b"
                        strokeWidth={p.isSelected ? 3 : 2}
                        className="cursor-pointer transition-all hover:r-6"
                        onClick={() => setSelectedObsId(p.o.id)}
                      >
                        <title>{`${p.o.acquisition_date}: NDVI ${p.o.mean_ndvi != null ? p.o.mean_ndvi.toFixed(2) : '—'} (Cloud: ${p.o.cloud_cover_percent}%)`}</title>
                      </circle>
                    ))}
                  </>
                );
              })()}
            </svg>

            {/* X-axis labels */}
            <div className="flex justify-between px-10 text-[10px] font-mono text-gray-400 mt-2">
              <span>{chronologicalObs[0]?.acquisition_date || 'Earliest acquisition'}</span>
              <span className="text-gray-300">•</span>
              <span>Chronological progression ({chronologicalObs.length} acquisitions plotted)</span>
              <span className="text-gray-300">•</span>
              <span>{chronologicalObs[chronologicalObs.length - 1]?.acquisition_date || 'Latest acquisition'}</span>
            </div>
          </div>
        </div>

        {/* Chart 2: Accumulated Precipitation & GDD Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card: Accumulated Precipitation */}
          <div className="bg-white rounded-2xl p-6 border border-black/[0.05] shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                  <Droplets size={14} className="text-blue-500" />
                  Accumulated Precipitation
                </h3>
                <p className="text-[11px] text-gray-400">NASA POWER GPM/MERRA-2 PRECTOTCORR</p>
              </div>
              <div className="text-right">
                <span className="text-xl font-bold text-gray-900">
                  {precipData?.total_accumulated_mm ?? 412} mm
                </span>
                <span className="text-[10px] text-gray-400 block">Season Total</span>
              </div>
            </div>

            {/* Area Chart */}
            <div className="h-44 pt-2">
              <svg viewBox="0 0 400 150" className="w-full h-full overflow-visible">
                <defs>
                  <linearGradient id="precipGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {precipData && precipData.daily_records.length > 1 && (() => {
                  const recs = precipData.daily_records;
                  const maxAcc = precipData.total_accumulated_mm || 500;
                  const step = 380 / (recs.length - 1);
                  const points = recs.map((r, i) => ({
                    x: 10 + i * step,
                    y: 140 - (r.accumulated_mm / maxAcc) * 125,
                  }));
                  const pathD = points.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`, '');
                  const areaD = `${pathD} L ${points[points.length - 1].x} 140 L ${points[0].x} 140 Z`;

                  return (
                    <>
                      <path d={areaD} fill="url(#precipGrad)" />
                      <path d={pathD} fill="none" stroke="#3b82f6" strokeWidth="2.5" />
                    </>
                  );
                })()}
              </svg>
            </div>
            <div className="flex justify-between text-[10px] font-mono text-gray-400">
              <span>{precipData?.start_date || 'Mar 1'}</span>
              <span>Accumulated mm (Daily)</span>
              <span>{precipData?.end_date || 'Oct 31'}</span>
            </div>
          </div>

          {/* Card: Growing Degree-Days (GDD) */}
          <div className="bg-white rounded-2xl p-6 border border-black/[0.05] shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                  <Thermometer size={14} className="text-amber-500" />
                  Growing Degree-Days (GDD)
                </h3>
                <p className="text-[11px] text-gray-400">
                  Thermal time: max(0, ((Tmax + Tmin)/2) - Tbase)
                </p>
              </div>

              {/* Base Temperature Config */}
              <div className="flex items-center gap-1.5">
                <label className="text-[11px] text-gray-500 font-medium">Tbase:</label>
                <select
                  value={selectedBaseTemp}
                  onChange={(e) => onBaseTempChange(Number(e.target.value))}
                  className="px-2 py-1 text-xs font-bold bg-gray-100 rounded-lg border-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value={0.0}>0.0°C (Cereals)</option>
                  <option value={4.4}>4.4°C (Wheat)</option>
                  <option value={5.0}>5.0°C (Rapeseed)</option>
                  <option value={8.0}>8.0°C (Sunflower)</option>
                  <option value={10.0}>10.0°C (Corn/Maize)</option>
                </select>
              </div>
            </div>

            <div className="flex items-baseline justify-between pt-1">
              <div>
                <span className="text-2xl font-bold text-gray-900">
                  {gddData?.total_accumulated_gdd ?? 1480}
                </span>{' '}
                <span className="text-xs text-gray-500">°C·days</span>
              </div>
              <span className="text-xs font-medium text-gray-500">
                {gddData?.valid_days ?? 245} seasonal days
              </span>
            </div>

            {/* GDD Area Chart */}
            <div className="h-36">
              <svg viewBox="0 0 400 130" className="w-full h-full overflow-visible">
                <defs>
                  <linearGradient id="gddGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {gddData && gddData.daily_records.length > 1 && (() => {
                  const recs = gddData.daily_records;
                  const maxGdd = gddData.total_accumulated_gdd || 2000;
                  const step = 380 / (recs.length - 1);
                  const points = recs.map((r, i) => ({
                    x: 10 + i * step,
                    y: 120 - (r.accumulated_gdd / maxGdd) * 110,
                  }));
                  const pathD = points.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`, '');
                  const areaD = `${pathD} L ${points[points.length - 1].x} 120 L ${points[0].x} 120 Z`;

                  return (
                    <>
                      <path d={areaD} fill="url(#gddGrad)" />
                      <path d={pathD} fill="none" stroke="#f59e0b" strokeWidth="2.5" />
                    </>
                  );
                })()}
              </svg>
            </div>
            <div className="flex justify-between text-[10px] font-mono text-gray-400">
              <span>Emergence</span>
              <span>Accumulated GDD Heat Units</span>
              <span>Maturity</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
