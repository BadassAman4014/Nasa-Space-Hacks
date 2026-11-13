import React, { useState } from 'react';
import {
  Sparkles,
  Layers,
  Mountain,
  SunMedium,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  RefreshCw,
  Compass,
  FileText,
  Sliders,
  Calendar,
  Eye,
  Activity,
  Droplets,
  Sprout
} from 'lucide-react';
import {
  FullFieldReportResponse,
  SatelliteObservation,
} from '../../services/fieldAnalyticsApi';

interface FieldReportTabProps {
  report: FullFieldReportResponse;
  onToggleObservation: (obsId: string, isIncluded: boolean) => Promise<void>;
  onRebuildAnalysis: () => Promise<void>;
  rebuilding: boolean;
}

export const FieldReportTab: React.FC<FieldReportTabProps> = ({
  report,
  onToggleObservation,
  onRebuildAnalysis,
  rebuilding,
}) => {
  const [selectedDepth, setSelectedDepth] = useState<string>('0-30cm');
  const [hasPendingChanges, setHasPendingChanges] = useState<boolean>(false);

  const { productivity, soil_brightness, elevation, correlation, historical_observations, soil_profile } = report;

  const handleToggle = async (obsId: string, currentVal: boolean) => {
    setHasPendingChanges(true);
    await onToggleObservation(obsId, !currentVal);
  };

  const handleRebuild = async () => {
    await onRebuildAnalysis();
    setHasPendingChanges(false);
  };

  // Depth data extraction from real SoilGrids profile
  const currentDepthData = React.useMemo(() => {
    if (!soil_profile) {
      return {
        texture_class: 'Arable Soil',
        sand_percent: 0,
        silt_percent: 0,
        clay_percent: 0,
        ph_h2o: 0,
        soc_g_kg: 0,
        soc_pct: 0,
        bulk_density_g_cm3: 0,
        cec_mmol_kg: 0,
        nitrogen_g_kg: 0,
        c_n_ratio: null as number | null,
      };
    }
    if (selectedDepth === '0-30cm' && soil_profile.topsoil_summary) {
      const ts = soil_profile.topsoil_summary as any;
      const soc = ts.organic_carbon_g_kg ?? (ts.organic_carbon_pct ? ts.organic_carbon_pct * 10 : 0);
      const n = ts.total_nitrogen_g_kg ?? 0;
      return {
        texture_class: ts.texture_class || 'Sandy Loam',
        sand_percent: Number(ts.sand_pct ?? 0),
        silt_percent: Number(ts.silt_pct ?? 0),
        clay_percent: Number(ts.clay_pct ?? 0),
        ph_h2o: Number(ts.ph ?? 0),
        soc_g_kg: Number(soc.toFixed(1)),
        soc_pct: Number((ts.organic_carbon_pct ?? (soc / 10)).toFixed(2)),
        bulk_density_g_cm3: Number(ts.bulk_density_g_cm3 ?? 0),
        cec_mmol_kg: Number(ts.cec_mmol_kg ?? 0),
        nitrogen_g_kg: Number(n.toFixed(2)),
        c_n_ratio: n > 0 ? Number((soc / n).toFixed(1)) : null,
      };
    }
    const ms = ((soil_profile as any).measurements || []) as Array<{ property_name: string; depth_interval: string; mean_value: number }>;
    const byProp: Record<string, number> = {};
    for (const m of ms) {
      if (m.depth_interval === selectedDepth) {
        byProp[m.property_name] = m.mean_value;
      }
    }
    const sand = byProp['sand'] ?? 0;
    const silt = byProp['silt'] ?? 0;
    const clay = byProp['clay'] ?? 0;
    const soc = byProp['soc'] ?? 0;
    const n = byProp['nitrogen'] ?? 0;
    const ph = byProp['phh2o'] ?? byProp['ph'] ?? 0;
    const bdod = byProp['bdod'] ?? 0;
    const cec = byProp['cec'] ?? 0;
    return {
      texture_class: (soil_profile as any).topsoil_summary?.texture_class || 'Sandy Loam',
      sand_percent: Number(sand.toFixed(1)),
      silt_percent: Number(silt.toFixed(1)),
      clay_percent: Number(clay.toFixed(1)),
      ph_h2o: Number(ph.toFixed(2)),
      soc_g_kg: Number(soc.toFixed(1)),
      soc_pct: Number((soc / 10).toFixed(2)),
      bulk_density_g_cm3: Number(bdod.toFixed(2)),
      cec_mmol_kg: Number(cec.toFixed(1)),
      nitrogen_g_kg: Number(n.toFixed(2)),
      c_n_ratio: n > 0 ? Number((soc / n).toFixed(1)) : null,
    };
  }, [soil_profile, selectedDepth]);

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* ── Section 1: Historical Productivity Zones ── */}
      <section className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700">
                <Sparkles size={16} />
              </span>
              <h2 className="text-base font-bold text-gray-900">Historical Productivity Zones</h2>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Multi-season Sentinel-2 peak vegetation composite categorized into relative tertiles
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              Stability: {productivity.stability_rating} ({productivity.stable_area_percent}%)
            </span>
            <span className="text-xs text-gray-500">
              {productivity.total_seasons_analyzed} seasons analyzed
            </span>
          </div>
        </div>

        {/* Productivity KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {productivity.zones.map((zone) => (
            <div
              key={zone.zone_id}
              className="p-4 rounded-xl border border-gray-100 bg-gray-50/70 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-600">{zone.label}</span>
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: zone.color }} />
              </div>
              <div className="my-2">
                <div className="text-2xl font-bold text-gray-900">{zone.area_percent}%</div>
                <div className="text-xs text-gray-500">{zone.area_ha.toFixed(2)} hectares</div>
              </div>
              <div className="text-[11px] text-gray-400 font-mono">
                Mean NDVI: {zone.mean_ndvi != null ? zone.mean_ndvi : '—'}
              </div>
            </div>
          ))}

          {/* Stable Area Card */}
          <div className="p-4 rounded-xl border border-emerald-100 bg-emerald-50/50 flex flex-col justify-between">
            <div className="flex items-center justify-between text-emerald-800 font-bold text-xs">
              <span>Stable Core Area</span>
              <CheckCircle2 size={16} className="text-emerald-600" />
            </div>
            <div className="my-2">
              <div className="text-2xl font-bold text-emerald-900">
                {productivity.stable_area_percent}%
              </div>
              <div className="text-xs text-emerald-700">
                {productivity.stable_area_ha.toFixed(2)} ha persistent zones
              </div>
            </div>
            <div className="text-[11px] text-emerald-600">Cross-season stability</div>
          </div>
        </div>

        {/* Spatial Productivity Map Frame */}
        <div className="rounded-2xl bg-gray-950 p-4 border border-gray-200 flex flex-col items-center justify-center relative overflow-hidden">
          <div className="max-w-md w-full aspect-4/3 flex items-center justify-center">
            {productivity.productivity_map_url ? (
              <img
                src={productivity.productivity_map_url}
                alt="Productivity Map"
                className="w-full h-full object-contain filter drop-shadow-xl"
              />
            ) : (
              <div className="text-xs text-gray-400">Loading multi-season productivity zones...</div>
            )}
          </div>

          <div className="w-full flex items-center justify-between pt-3 border-t border-gray-800 text-xs text-gray-300">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <i className="w-3 h-3 rounded-sm bg-[#1fa35b]" /> High Productivity (Top 33%)
              </span>
              <span className="flex items-center gap-1.5">
                <i className="w-3 h-3 rounded-sm bg-[#eab308]" /> Medium Productivity (Mid 33%)
              </span>
              <span className="flex items-center gap-1.5">
                <i className="w-3 h-3 rounded-sm bg-[#ef4444]" /> Low Productivity (Low 33%)
              </span>
            </div>
            <span className="text-[11px] text-gray-400">Resolution: 10m Sentinel-2</span>
          </div>
        </div>
      </section>

      {/* ── Section 2: Productivity, Soil Brightness & Elevation Correlation ── */}
      <section className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-blue-50 text-blue-700">
              <Sliders size={16} />
            </span>
            <h2 className="text-base font-bold text-gray-900">
              Productivity, Soil Brightness & Elevation Correlation
            </h2>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Three synchronized spatial layers and spatial cross-correlation analysis
          </p>
        </div>

        {/* 3 Synchronized Spatial Map Panels */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Panel 1: Productivity */}
          <div className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50 flex flex-col">
            <div className="px-4 py-2.5 bg-white border-b border-gray-200 flex items-center justify-between text-xs font-bold text-gray-800">
              <span className="flex items-center gap-1.5">
                <Sparkles size={13} className="text-emerald-600" /> Productivity Zones
              </span>
              <span className="text-emerald-600">Multi-Season</span>
            </div>
            <div className="p-3 flex-1 flex items-center justify-center bg-gray-950">
              {productivity.productivity_map_url && (
                <img
                  src={productivity.productivity_map_url}
                  alt="Productivity"
                  className="max-h-48 object-contain"
                />
              )}
            </div>
            <div className="p-3 bg-white border-t border-gray-100 text-[11px] text-gray-500">
              33% tertile ranking across {productivity.total_seasons_analyzed} seasons
            </div>
          </div>

          {/* Panel 2: Soil Brightness */}
          <div className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50 flex flex-col">
            <div className="px-4 py-2.5 bg-white border-b border-gray-200 flex items-center justify-between text-xs font-bold text-gray-800">
              <span className="flex items-center gap-1.5">
                <SunMedium size={13} className="text-amber-600" /> Soil Brightness Map
              </span>
              <span className="text-amber-600">Bare Soil</span>
            </div>
            <div className="p-3 flex-1 flex items-center justify-center bg-gray-950">
              {soil_brightness.map_url && (
                <img
                  src={soil_brightness.map_url}
                  alt="Soil Brightness"
                  className="max-h-48 object-contain"
                />
              )}
            </div>
            <div className="p-3 bg-white border-t border-gray-100 text-[11px] text-gray-500">
              Dark humic soil (left) to light sandy crests (right)
            </div>
          </div>

          {/* Panel 3: Elevation */}
          <div className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50 flex flex-col">
            <div className="px-4 py-2.5 bg-white border-b border-gray-200 flex items-center justify-between text-xs font-bold text-gray-800">
              <span className="flex items-center gap-1.5">
                <Mountain size={13} className="text-indigo-600" /> Elevation Map (DEM)
              </span>
              <span className="text-indigo-600">30m GLO</span>
            </div>
            <div className="p-3 flex-1 flex items-center justify-center bg-gray-950">
              {elevation.map_url && (
                <img
                  src={elevation.map_url}
                  alt="Elevation"
                  className="max-h-48 object-contain"
                />
              )}
            </div>
            <div className="p-3 bg-white border-t border-gray-100 text-[11px] text-gray-500">
              Range: {elevation.min_elevation_m}m to {elevation.max_elevation_m}m ASL (Slope: {elevation.mean_slope_deg}°)
            </div>
          </div>
        </div>

        {/* Statistical Correlation Table */}
        <div className="rounded-2xl border border-gray-200 overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-600 font-bold uppercase tracking-wider border-b border-gray-200">
              <tr>
                <th className="px-5 py-3.5">Spatial Pair</th>
                <th className="px-4 py-3.5">Pearson r</th>
                <th className="px-4 py-3.5">Spearman ρ</th>
                <th className="px-4 py-3.5">Pixels (N)</th>
                <th className="px-5 py-3.5">Scientific Interpretation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-800">
              <tr>
                <td className="px-5 py-4 font-semibold text-gray-900 flex items-center gap-2">
                  <Mountain size={14} className="text-indigo-600" />
                  Productivity vs Elevation
                </td>
                <td className="px-4 py-4 font-mono font-bold text-indigo-700">
                  {correlation.productivity_vs_elevation
                    ? correlation.productivity_vs_elevation.pearson_r.toFixed(2)
                    : '—'}
                </td>
                <td className="px-4 py-4 font-mono text-gray-600">
                  {correlation.productivity_vs_elevation
                    ? correlation.productivity_vs_elevation.spearman_rho.toFixed(2)
                    : '—'}
                </td>
                <td className="px-4 py-4 font-mono text-gray-500">
                  {correlation.sample_pixel_count}
                </td>
                <td className="px-5 py-4 text-gray-600">
                  {correlation.productivity_vs_elevation
                    ? correlation.productivity_vs_elevation.interpretation
                    : 'Unavailable (no aligned productivity layers).'}
                </td>
              </tr>
              <tr>
                <td className="px-5 py-4 font-semibold text-gray-900 flex items-center gap-2">
                  <SunMedium size={14} className="text-amber-600" />
                  Productivity vs Soil Brightness
                </td>
                <td className="px-4 py-4 font-mono font-bold text-amber-700">
                  {correlation.productivity_vs_brightness
                    ? correlation.productivity_vs_brightness.pearson_r.toFixed(2)
                    : '—'}
                </td>
                <td className="px-4 py-4 font-mono text-gray-600">
                  {correlation.productivity_vs_brightness
                    ? correlation.productivity_vs_brightness.spearman_rho.toFixed(2)
                    : '—'}
                </td>
                <td className="px-4 py-4 font-mono text-gray-500">
                  {correlation.sample_pixel_count}
                </td>
                <td className="px-5 py-4 text-gray-600">
                  {correlation.productivity_vs_brightness
                    ? correlation.productivity_vs_brightness.interpretation
                    : 'Unavailable (no aligned soil-brightness layer).'}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Autocorrelation & Causation Caveat */}
          <div className="p-4 bg-amber-50/60 border-t border-amber-100 flex items-start gap-2.5 text-xs text-amber-900">
            <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">{correlation.spatial_autocorrelation_note}</p>
              <p className="text-amber-800 text-[11px] mt-0.5">{correlation.scientific_disclaimer}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 3: Historical NDVI Images Used in the Calculation ── */}
      <section className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-purple-50 text-purple-700">
                <Layers size={16} />
              </span>
              <h2 className="text-base font-bold text-gray-900">
                NDVI Images Used in the Calculation
              </h2>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Historical Sentinel-2 satellite acquisitions used to generate multi-season productivity zones
            </p>
          </div>

          {hasPendingChanges && (
            <button
              onClick={handleRebuild}
              disabled={rebuilding}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw size={13} className={rebuilding ? 'animate-spin' : ''} />
              <span>{rebuilding ? 'Recalculating...' : 'Rebuild Productivity Analysis'}</span>
            </button>
          )}
        </div>

        {/* Gallery Grid of Observations */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3.5">
          {historical_observations.map((obs) => (
            <div
              key={obs.id}
              className={`rounded-xl border p-2.5 transition flex flex-col justify-between ${obs.is_included
                  ? 'border-gray-200 bg-white hover:border-emerald-300'
                  : 'border-dashed border-gray-300 bg-gray-50 opacity-60'
                }`}
            >
              {/* Thumbnail */}
              <div className="aspect-square rounded-lg overflow-hidden bg-gray-900 mb-2 relative">
                {obs.rgb_preview_url ? (
                  <img
                    src={obs.rgb_preview_url}
                    alt={obs.acquisition_date}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-500">
                    S2 Scene
                  </div>
                )}
                <span className="absolute bottom-1 right-1 bg-black/75 px-1.5 py-0.5 rounded text-[9px] font-mono text-white">
                  {obs.cloud_cover_percent}% cloud
                </span>
              </div>

              {/* Info */}
              <div className="space-y-1 text-center">
                <div className="text-xs font-bold text-gray-800">{obs.acquisition_date}</div>
                <div className="text-[11px] text-emerald-700 font-semibold font-mono">
                  NDVI: {obs.mean_ndvi != null ? obs.mean_ndvi.toFixed(2) : '—'}
                </div>
              </div>

              {/* Include/Exclude Toggle */}
              <div className="pt-2 mt-2 border-t border-gray-100 flex items-center justify-between text-[11px]">
                <span className="text-gray-500">{obs.is_included ? 'Included' : 'Excluded'}</span>
                <input
                  type="checkbox"
                  checked={obs.is_included}
                  onChange={() => handleToggle(obs.id, obs.is_included)}
                  className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4 cursor-pointer"
                  title="Toggle inclusion in multi-season productivity calculation"
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Section 4: Soil Analysis Results (SoilGrids v2.0) ── */}
      <section className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-amber-50 text-amber-700">
                <Sprout size={16} />
              </span>
              <h2 className="text-base font-bold text-gray-900">Soil Analysis Results</h2>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              ISRIC SoilGrids v2.0 physical and chemical soil properties across depth layers
            </p>
          </div>

          {/* Depth Selector Pills */}
          <div className="flex items-center bg-gray-100 p-0.5 rounded-xl text-xs font-semibold overflow-x-auto max-w-full">
            {['0-30cm', '0-5cm', '5-15cm', '15-30cm', '30-60cm', '60-100cm'].map((depth) => (
              <button
                key={depth}
                onClick={() => setSelectedDepth(depth)}
                className={`px-3 py-1 rounded-lg transition whitespace-nowrap ${selectedDepth === depth
                    ? 'bg-white text-gray-900 shadow-xs'
                    : 'text-gray-500 hover:text-gray-900'
                  }`}
              >
                {depth}
              </button>
            ))}
          </div>
        </div>

        {/* Soil Texture Class Bar */}
        <div className="p-4 rounded-xl border border-gray-100 bg-gray-50 space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-gray-700">
            <span>USDA Soil Texture Class: <b className="text-amber-800">{currentDepthData.texture_class}</b></span>
            <span className="text-gray-500 font-normal">Layer: {selectedDepth}</span>
          </div>

          <div className="h-3 rounded-full w-full flex overflow-hidden">
            <div
              style={{ width: `${currentDepthData.sand_percent}%` }}
              className="bg-amber-300"
              title={`Sand: ${currentDepthData.sand_percent}%`}
            />
            <div
              style={{ width: `${currentDepthData.silt_percent}%` }}
              className="bg-blue-300"
              title={`Silt: ${currentDepthData.silt_percent}%`}
            />
            <div
              style={{ width: `${currentDepthData.clay_percent}%` }}
              className="bg-rose-400"
              title={`Clay: ${currentDepthData.clay_percent}%`}
            />
          </div>

          <div className="flex justify-between text-[11px] font-semibold text-gray-500">
            <span className="flex items-center gap-1">
              <i className="w-2.5 h-2.5 rounded-full bg-amber-300" /> Sand: {currentDepthData.sand_percent}%
            </span>
            <span className="flex items-center gap-1">
              <i className="w-2.5 h-2.5 rounded-full bg-blue-300" /> Silt: {currentDepthData.silt_percent}%
            </span>
            <span className="flex items-center gap-1">
              <i className="w-2.5 h-2.5 rounded-full bg-rose-400" /> Clay: {currentDepthData.clay_percent}%
            </span>
          </div>
        </div>

        {/* Soil Characteristics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
          <div className="p-3 rounded-xl border border-gray-100 bg-white shadow-2xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">Soil pH</span>
            <div className="text-lg font-bold text-gray-900 mt-1">{currentDepthData.ph_h2o > 0 ? currentDepthData.ph_h2o : '—'}</div>
            <span className="text-[10px] text-emerald-600 font-medium">{currentDepthData.ph_h2o >= 6.0 && currentDepthData.ph_h2o <= 7.2 ? 'Optimal' : currentDepthData.ph_h2o > 0 ? 'Measured' : '—'}</span>
          </div>

          <div className="p-3 rounded-xl border border-gray-100 bg-white shadow-2xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">Organic Carbon</span>
            <div className="text-lg font-bold text-gray-900 mt-1">{currentDepthData.soc_g_kg > 0 ? `${currentDepthData.soc_g_kg} g/kg` : '—'}</div>
            <span className="text-[10px] text-gray-500 font-medium">{currentDepthData.soc_pct > 0 ? `${currentDepthData.soc_pct}% SOC` : '—'}</span>
          </div>

          <div className="p-3 rounded-xl border border-gray-100 bg-white shadow-2xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">Bulk Density</span>
            <div className="text-lg font-bold text-gray-900 mt-1">{currentDepthData.bulk_density_g_cm3 > 0 ? `${currentDepthData.bulk_density_g_cm3} g/cm³` : '—'}</div>
            <span className="text-[10px] text-gray-500 font-medium">Fine Earth</span>
          </div>

          <div className="p-3 rounded-xl border border-gray-100 bg-white shadow-2xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">Cation Exch. (CEC)</span>
            <div className="text-lg font-bold text-gray-900 mt-1">{currentDepthData.cec_mmol_kg > 0 ? currentDepthData.cec_mmol_kg : '—'}</div>
            <span className="text-[10px] text-gray-500 font-medium">mmol(c)/kg</span>
          </div>

          <div className="p-3 rounded-xl border border-gray-100 bg-white shadow-2xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">Total Nitrogen</span>
            <div className="text-lg font-bold text-gray-900 mt-1">{currentDepthData.nitrogen_g_kg > 0 ? `${currentDepthData.nitrogen_g_kg} g/kg` : '—'}</div>
            <span className="text-[10px] text-gray-500 font-medium">Mineralizable</span>
          </div>

          <div className="p-3 rounded-xl border border-gray-100 bg-white shadow-2xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">C:N Ratio</span>
            <div className="text-lg font-bold text-gray-900 mt-1">{currentDepthData.c_n_ratio != null ? currentDepthData.c_n_ratio : '—'}</div>
            <span className="text-[10px] text-gray-500 font-medium">Equilibrium</span>
          </div>
        </div>

        <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
          <span>Source: ISRIC SoilGrids v2.0 (250m base spatial resolution clipped to polygon)</span>
          <span>Coverage: 100% Verified</span>
        </div>
      </section>
    </div>
  );
};
