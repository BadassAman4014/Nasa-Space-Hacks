import React, { useState, useEffect, useCallback } from 'react';
import {
  Satellite,
  Droplets,
  CloudRain,
  Sprout,
  RefreshCw,
  AlertTriangle,
  Info,
  Calendar,
  Layers,
  ChevronRight,
  TrendingUp,
  BarChart2,
  CheckCircle2,
} from 'lucide-react';
import {
  environmentApi,
  type FieldEnvironmentalResponse,
  type DatasetType,
} from '../../services/environmentApi';

interface FieldEnvironmentalCardProps {
  fieldId: string;
  fieldName: string;
  fieldAreaHa: number;
  notify?: (msg: string) => void;
}

export const FieldEnvironmentalCard: React.FC<FieldEnvironmentalCardProps> = ({
  fieldId,
  fieldName,
  fieldAreaHa,
  notify,
}) => {
  const [data, setData] = useState<FieldEnvironmentalResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [extracting, setExtracting] = useState<boolean>(false);
  const [selectedDataset, setSelectedDataset] = useState<DatasetType>('smap');
  const [dateRange, setDateRange] = useState<'30' | '90' | '180'>('90');
  const [error, setError] = useState<string | null>(null);

  // Compute dates based on range selection
  const getDateWindow = useCallback(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - parseInt(dateRange, 10));
    return {
      start_date: start.toISOString().split('T')[0],
      end_date: end.toISOString().split('T')[0],
    };
  }, [dateRange]);

  // Load persistent environmental data
  const loadData = useCallback(async () => {
    if (!fieldId) return;
    setLoading(true);
    setError(null);
    try {
      const dates = getDateWindow();
      const res = await environmentApi.getFieldEnvironmental(fieldId, {
        start_date: dates.start_date,
        end_date: dates.end_date,
      });
      setData(res);
    } catch (err: any) {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [fieldId, getDateWindow]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Trigger extraction
  const handleExtract = async (refresh: boolean = false) => {
    setExtracting(true);
    setError(null);
    try {
      if (notify) {
        notify(refresh ? 'Refreshing NASA Earth observations...' : 'Fetching NASA satellite data (SMAP, GPM, MODIS)...');
      }
      const dates = getDateWindow();
      const res = await environmentApi.extractEnvironmental(fieldId, {
        start_date: dates.start_date,
        end_date: dates.end_date,
        datasets: ['smap', 'gpm', 'modis'],
        force_refresh: refresh,
      });
      setData(res);
      if (notify) {
        notify('NASA Earth observation data successfully updated.');
      }
    } catch (err: any) {
      console.error('NASA extraction failed:', err);
      setError(err?.message || 'Failed to extract NASA data');
      if (notify) {
        notify('NASA data extraction failed. Please try again.');
      }
    } finally {
      setExtracting(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-[#fcfcfc] border border-[#e8e8e8] rounded-xl p-4 text-center my-3">
        <div className="w-5 h-5 border-2 border-[#1fa35b] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-xs text-[#888]">Loading NASA environmental observations...</p>
      </div>
    );
  }

  const hasAnyData = Boolean(
    (data?.smap?.observations?.length ?? 0) > 0 ||
    (data?.gpm?.observations?.length ?? 0) > 0 ||
    (data?.modis?.observations?.length ?? 0) > 0
  );

  // Empty state
  if (!data || !hasAnyData) {
    return (
      <div className="bg-[#f9fafb] border border-[#e5e7eb] rounded-xl p-4 my-3 text-center">
        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-2.5">
          <Satellite size={20} />
        </div>
        <h4 className="text-xs font-bold text-[#1f2937] mb-1">NASA Environmental Data</h4>
        <p className="text-[11px] text-[#6b7280] leading-relaxed mb-3">
          Retrieve real satellite Earth observations for this field:
          NASA SMAP (soil moisture), NASA GPM IMERG (precipitation), and NASA MODIS (NDVI/EVI vegetation).
        </p>
        <button
          onClick={() => handleExtract(false)}
          disabled={extracting}
          className="w-full py-2 px-3 rounded-lg bg-[#1fa35b] hover:bg-[#188a4c] text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-sm transition disabled:opacity-50"
        >
          {extracting ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Fetching NASA Satellites...</span>
            </>
          ) : (
            <>
              <Satellite size={14} />
              <span>Fetch NASA Environmental Data</span>
            </>
          )}
        </button>
      </div>
    );
  }

  const smap = data.smap;
  const gpm = data.gpm;
  const modis = data.modis;

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-xl p-3.5 my-3 shadow-sm space-y-3">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-[#f0f0f0] pb-2.5">
        <div className="flex items-center gap-1.5">
          <Satellite size={16} className="text-[#3b82f6]" />
          <h4 className="text-xs font-bold text-[#1f2937]">NASA Earth Observations</h4>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Date range picker */}
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as any)}
            className="text-[10px] bg-[#f3f4f6] border border-[#e5e7eb] text-[#4b5563] px-1.5 py-0.5 rounded font-medium focus:outline-none"
          >
            <option value="30">30 Days</option>
            <option value="90">90 Days</option>
            <option value="180">6 Months</option>
          </select>
          <button
            onClick={() => handleExtract(true)}
            disabled={extracting}
            className="p-1 rounded-md hover:bg-[#f3f4f6] text-[#6b7280] hover:text-[#111] transition"
            title="Refresh satellite data"
          >
            <RefreshCw size={13} className={extracting ? 'animate-spin text-[#1fa35b]' : ''} />
          </button>
        </div>
      </div>

      {/* Dataset Sub-Tabs */}
      <div className="grid grid-cols-3 gap-1 bg-[#f3f4f6] p-1 rounded-lg text-xs font-semibold">
        <button
          onClick={() => setSelectedDataset('smap')}
          className={`py-1.5 px-2 rounded-md flex items-center justify-center gap-1 transition ${
            selectedDataset === 'smap'
              ? 'bg-white text-[#1f2937] shadow-xs'
              : 'text-[#6b7280] hover:text-[#111]'
          }`}
        >
          <Droplets size={13} className="text-[#0284c7]" />
          <span>SMAP</span>
        </button>
        <button
          onClick={() => setSelectedDataset('gpm')}
          className={`py-1.5 px-2 rounded-md flex items-center justify-center gap-1 transition ${
            selectedDataset === 'gpm'
              ? 'bg-white text-[#1f2937] shadow-xs'
              : 'text-[#6b7280] hover:text-[#111]'
          }`}
        >
          <CloudRain size={13} className="text-[#2563eb]" />
          <span>GPM</span>
        </button>
        <button
          onClick={() => setSelectedDataset('modis')}
          className={`py-1.5 px-2 rounded-md flex items-center justify-center gap-1 transition ${
            selectedDataset === 'modis'
              ? 'bg-white text-[#1f2937] shadow-xs'
              : 'text-[#6b7280] hover:text-[#111]'
          }`}
        >
          <Sprout size={13} className="text-[#1fa35b]" />
          <span>MODIS</span>
        </button>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* VIEW 1: NASA SMAP (Soil Moisture)                              */}
      {/* ───────────────────────────────────────────────────────────── */}
      {selectedDataset === 'smap' && smap && (
        <div className="space-y-3">
          {/* Coarse Resolution Alert */}
          {smap.is_coarse_resolution && (
            <div className="bg-[#eff6ff] border border-[#dbeafe] rounded-lg p-2.5 flex items-start gap-2 text-[#1e40af]">
              <Info size={14} className="mt-0.5 shrink-0 text-[#3b82f6]" />
              <div className="text-[11px] leading-tight">
                <strong>SMAP ~9 km Resolution Note:</strong> {smap.resolution_limitation}
              </div>
            </div>
          )}

          {/* Metric Highlights */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[#f9fafb] border border-[#f3f4f6] rounded-lg p-2">
              <span className="text-[10px] text-[#6b7280] block">Latest Surface Moisture</span>
              <strong className="text-base font-bold text-[#111827]">
                {smap.latest_soil_moisture !== undefined ? smap.latest_soil_moisture : '—'}{' '}
                <small className="text-[10px] font-normal text-[#6b7280]">m³/m³</small>
              </strong>
              <span className="text-[10px] text-[#0284c7] block mt-0.5">
                Volumetric water content
              </span>
            </div>

            <div className="bg-[#f9fafb] border border-[#f3f4f6] rounded-lg p-2">
              <span className="text-[10px] text-[#6b7280] block">Seasonal Mean</span>
              <strong className="text-base font-bold text-[#111827]">
                {smap.seasonal_mean !== undefined ? smap.seasonal_mean : '—'}{' '}
                <small className="text-[10px] font-normal text-[#6b7280]">m³/m³</small>
              </strong>
              <span className="text-[10px] text-[#6b7280] block mt-0.5">
                {smap.observations.length} daily observations
              </span>
            </div>
          </div>

          {/* Sparkline / Bar Visualization */}
          {smap.observations.length > 0 && (
            <div>
              <div className="flex justify-between items-center text-[10px] text-[#6b7280] mb-1 font-semibold uppercase tracking-wider">
                <span>Daily Moisture Trend</span>
                <span>Range: 0.0 – 0.5 m³/m³</span>
              </div>
              <div className="h-14 flex items-end gap-[2px] bg-[#f9fafb] border border-[#f3f4f6] rounded-lg p-1.5 overflow-hidden">
                {smap.observations.slice(-30).map((o, idx) => {
                  const pct = Math.min(100, Math.max(10, (o.mean_value / 0.5) * 100));
                  return (
                    <div
                      key={idx}
                      className="flex-1 bg-[#38bdf8] hover:bg-[#0284c7] rounded-xs transition"
                      style={{ height: `${pct}%` }}
                      title={`${o.observation_date}: ${o.mean_value} m³/m³`}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between text-[9px] text-[#9ca3af] mt-1">
                <span>{smap.observations[0]?.observation_date}</span>
                <span>{smap.observations[smap.observations.length - 1]?.observation_date}</span>
              </div>
            </div>
          )}

          {/* Monthly Averages List */}
          {smap.monthly_means.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-[#6b7280] uppercase tracking-wider block">
                Monthly Means
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {smap.monthly_means.slice(-4).map((m, idx) => (
                  <div key={idx} className="bg-[#f9fafb] p-1.5 rounded-lg border border-[#f3f4f6] text-[11px] flex justify-between">
                    <span className="font-medium text-[#4b5563]">{m.month}</span>
                    <strong className="text-[#111827]">{m.mean_soil_moisture} m³/m³</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* VIEW 2: NASA GPM (Precipitation)                               */}
      {/* ───────────────────────────────────────────────────────────── */}
      {selectedDataset === 'gpm' && gpm && (
        <div className="space-y-3">
          {/* Coarse Resolution Alert */}
          {gpm.is_coarse_resolution && (
            <div className="bg-[#eff6ff] border border-[#dbeafe] rounded-lg p-2.5 flex items-start gap-2 text-[#1e40af]">
              <Info size={14} className="mt-0.5 shrink-0 text-[#2563eb]" />
              <div className="text-[11px] leading-tight">
                <strong>GPM ~10 km Resolution Note:</strong> {gpm.resolution_limitation}
              </div>
            </div>
          )}

          {/* Summary Metrics Grid */}
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <div className="bg-[#f9fafb] border border-[#f3f4f6] rounded-lg p-2">
              <span className="text-[9px] text-[#6b7280] block uppercase font-bold">Total Rain</span>
              <strong className="text-sm font-bold text-[#111827]">
                {gpm.total_seasonal_accumulation_mm ?? '—'} <small className="text-[9px]">mm</small>
              </strong>
              <span className="text-[9px] text-[#2563eb] block">Accumulated</span>
            </div>

            <div className="bg-[#f9fafb] border border-[#f3f4f6] rounded-lg p-2">
              <span className="text-[9px] text-[#6b7280] block uppercase font-bold">Rainy Days</span>
              <strong className="text-sm font-bold text-[#111827]">
                {gpm.rainy_days_count} <small className="text-[9px]">days</small>
              </strong>
              <span className="text-[9px] text-[#15803d] block">&gt; 1.0 mm</span>
            </div>

            <div className="bg-[#f9fafb] border border-[#f3f4f6] rounded-lg p-2">
              <span className="text-[9px] text-[#6b7280] block uppercase font-bold">Heavy Events</span>
              <strong className="text-sm font-bold text-[#111827]">
                {gpm.heavy_rain_events_count} <small className="text-[9px]">events</small>
              </strong>
              <span className="text-[9px] text-[#b45309] block">&gt; 20 mm</span>
            </div>
          </div>

          {/* Daily Rainfall Bars */}
          {gpm.observations.length > 0 && (
            <div>
              <div className="flex justify-between items-center text-[10px] text-[#6b7280] mb-1 font-semibold uppercase tracking-wider">
                <span>Daily Rainfall (mm)</span>
                <span>IMERG V07B ({gpm.product_run} Run)</span>
              </div>
              <div className="h-14 flex items-end gap-[2px] bg-[#f9fafb] border border-[#f3f4f6] rounded-lg p-1.5 overflow-hidden">
                {gpm.observations.slice(-30).map((o, idx) => {
                  const heightPct = Math.min(100, Math.max(o.mean_value > 0 ? 8 : 2, (o.mean_value / 25.0) * 100));
                  const isHeavy = o.mean_value >= 20.0;
                  return (
                    <div
                      key={idx}
                      className={`flex-1 rounded-xs transition ${
                        isHeavy ? 'bg-[#f59e0b]' : o.mean_value > 0 ? 'bg-[#2563eb]' : 'bg-[#e5e7eb]'
                      }`}
                      style={{ height: `${heightPct}%` }}
                      title={`${o.observation_date}: ${o.mean_value} mm`}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between text-[9px] text-[#9ca3af] mt-1">
                <span>{gpm.observations[0]?.observation_date}</span>
                <span>{gpm.observations[gpm.observations.length - 1]?.observation_date}</span>
              </div>
            </div>
          )}

          {/* Monthly Accumulation List */}
          {gpm.monthly_accumulation_mm.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-[#6b7280] uppercase tracking-wider block">
                Monthly Rainfall Totals
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {gpm.monthly_accumulation_mm.slice(-4).map((m, idx) => (
                  <div key={idx} className="bg-[#f9fafb] p-1.5 rounded-lg border border-[#f3f4f6] text-[11px] flex justify-between">
                    <span className="font-medium text-[#4b5563]">{m.month}</span>
                    <strong className="text-[#111827]">
                      {m.accumulated_precipitation_mm} mm{' '}
                      <small className="text-[#6b7280] font-normal">({m.rainy_days}d)</small>
                    </strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* VIEW 3: NASA MODIS (Vegetation Indices)                        */}
      {/* ───────────────────────────────────────────────────────────── */}
      {selectedDataset === 'modis' && modis && (
        <div className="space-y-3">
          {/* Subpixel Warning if field < 6.25 ha */}
          {modis.is_subpixel && modis.resolution_limitation && (
            <div className="bg-[#fffbeb] border border-[#fef3c7] rounded-lg p-2.5 flex items-start gap-2 text-[#92400e]">
              <Info size={14} className="mt-0.5 shrink-0 text-[#b45309]" />
              <div className="text-[11px] leading-tight">
                <strong>Subpixel Note (250 m):</strong> {modis.resolution_limitation}
              </div>
            </div>
          )}

          {/* Metric Highlights */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg p-2">
              <span className="text-[10px] text-[#166534] block font-bold uppercase tracking-wider">
                Latest 16-Day NDVI
              </span>
              <strong className="text-lg font-black text-[#15803d]">
                {modis.latest_ndvi !== undefined ? modis.latest_ndvi : '—'}
              </strong>
              <span className="text-[10px] text-[#15803d] block mt-0.5">
                {modis.latest_ndvi && modis.latest_ndvi > 0.6
                  ? 'Dense active canopy'
                  : modis.latest_ndvi && modis.latest_ndvi > 0.35
                  ? 'Moderate vegetative cover'
                  : 'Low vegetative cover / bare'}
              </span>
            </div>

            <div className="bg-[#f9fafb] border border-[#f3f4f6] rounded-lg p-2">
              <span className="text-[10px] text-[#6b7280] block font-bold uppercase tracking-wider">
                Seasonal Peak NDVI
              </span>
              <strong className="text-lg font-bold text-[#111827]">
                {modis.seasonal_max_ndvi !== undefined ? modis.seasonal_max_ndvi : '—'}
              </strong>
              <span className="text-[10px] text-[#6b7280] block mt-0.5">
                Mean EVI: {modis.seasonal_mean_evi ?? '—'}
              </span>
            </div>
          </div>

          {/* 16-Day Composite Progression */}
          {modis.observations.length > 0 && (
            <div>
              <div className="flex justify-between items-center text-[10px] text-[#6b7280] mb-1 font-semibold uppercase tracking-wider">
                <span>16-Day NDVI Composite History</span>
                <span>MOD13Q1.061 (Tile h18v03)</span>
              </div>
              <div className="h-16 flex items-end gap-1 bg-[#f9fafb] border border-[#f3f4f6] rounded-lg p-1.5 overflow-hidden">
                {modis.observations.map((o, idx) => {
                  const pct = Math.min(100, Math.max(10, (o.mean_value / 1.0) * 100));
                  return (
                    <div
                      key={idx}
                      className="flex-1 bg-[#22c55e] hover:bg-[#15803d] rounded-xs transition flex flex-col justify-end"
                      style={{ height: `${pct}%` }}
                      title={`${o.observation_date}: NDVI ${o.mean_value}`}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between text-[9px] text-[#9ca3af] mt-1">
                <span>{modis.observations[0]?.observation_date}</span>
                <span>{modis.observations[modis.observations.length - 1]?.observation_date}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Provenance Footer */}
      <div className="pt-2 border-t border-[#f0f0f0] text-[10px] text-[#9ca3af] flex justify-between items-center">
        <span>
          {selectedDataset === 'smap' && 'Source: NASA SMAP SPL3SMP_E.006 (9 km)'}
          {selectedDataset === 'gpm' && 'Source: NASA GPM IMERG V07B (0.1°)'}
          {selectedDataset === 'modis' && 'Source: NASA MODIS MOD13Q1.061 (250 m)'}
        </span>
        <span className="flex items-center gap-1 text-[#15803d]">
          <CheckCircle2 size={11} /> Verified Ingestion
        </span>
      </div>
    </div>
  );
};

