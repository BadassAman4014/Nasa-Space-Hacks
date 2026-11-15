import { useCallback, useEffect, useMemo, useState } from 'react';
import { CloudRain, Droplets, Info, RefreshCw } from 'lucide-react';
import { environmentApi, type FieldEnvironmentalResponse, type EnvironmentalObservationItem } from '../../services/environmentApi';
import { fieldHealthApi, type HealthTrend } from '../../services/fieldHealthApi';
import { useI18n } from '../../i18n';

type Range = 30 | 90 | 180;
type Detail = 'rain' | 'soil';

export function WaterTab({ fieldId, fieldName, notify }: { fieldId: string; fieldName: string; notify: (message: string) => void }) {
  const { formatDate, formatNumber } = useI18n();
  const [range, setRange] = useState<Range>(90);
  const [detail, setDetail] = useState<Detail>('rain');
  const [data, setData] = useState<FieldEnvironmentalResponse | null>(null);
  const [health, setHealth] = useState<HealthTrend | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'day' | 'month'>('day');

  const dates = useMemo(() => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - range);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }, [range]);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const [response, trend] = await Promise.all([
        environmentApi.getFieldEnvironmental(fieldId, { start_date: dates.start, end_date: dates.end }),
        fieldHealthApi.getTrend(fieldId, refresh),
      ]);
      setData(response);
      setHealth(trend);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Water data could not be loaded.');
      return false;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dates.end, dates.start, fieldId]);

  useEffect(() => { void load(); }, [load]);

  const rain = useMemo(() => ordered(data?.gpm?.observations || []), [data]);
  const soil = useMemo(() => {
    if (health?.moisture_trend.available) {
      return health.moisture_trend.modelled.map((point) => ({ id: point.date, observation_date: point.date, mean_value: point.rootzone_m3m3, unit: 'm³/m³' }));
    }
    return ordered(data?.smap?.observations || []).map((point) => ({ id: point.id, observation_date: point.observation_date, mean_value: point.mean_value, unit: point.unit }));
  }, [data, health]);
  const rainTotal = rain.reduce((sum, point) => sum + Math.max(0, point.mean_value), 0);
  const rainyDays = rain.filter((point) => point.mean_value > 0).length;
  const lastRain = [...rain].reverse().find((point) => point.mean_value > 0);
  const daysSinceRain = lastRain ? Math.max(0, Math.floor((Date.now() - new Date(lastRain.observation_date).getTime()) / 86400000)) : null;
  const latestSoil = soil[soil.length - 1];
  const normal = health?.moisture_trend.available ? health.moisture_trend.usual_range : null;
  const soilStatus = latestSoil && normal
    ? latestSoil.mean_value < normal.p10 ? 'Dry' : latestSoil.mean_value > normal.p90 ? 'Wet' : 'OK'
    : null;
  const updatedAt = data?.last_updated || rain.at(-1)?.created_at || soil.at(-1)?.observation_date || null;

  const handleRefresh = async () => {
    if (await load(true)) notify('NASA data updated');
  };

  if (loading && !data) return <div className="mx-auto max-w-7xl space-y-5" aria-label="Loading water data"><div className="h-24 animate-pulse rounded-2xl bg-white" /><div className="grid grid-cols-2 gap-5"><div className="h-40 animate-pulse rounded-2xl bg-white" /><div className="h-40 animate-pulse rounded-2xl bg-white" /></div><div className="h-80 animate-pulse rounded-2xl bg-white" /></div>;
  if (error && !data) return <div className="mx-auto max-w-7xl rounded-2xl border border-red-200 bg-white p-8"><h2 className="text-lg font-extrabold text-slate-900">Water data unavailable</h2><p className="mt-2 text-sm text-slate-600">{error}</p><button onClick={() => void load()} className="mt-4 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white">Retry</button></div>;

  return <div className="mx-auto max-w-7xl space-y-6">
    <header className="flex items-start justify-between gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div><div className="flex items-center gap-3"><h1 className="text-2xl font-extrabold text-slate-950">Water</h1><span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-600">Regional estimate · ~10 km</span></div><p className="mt-1 text-sm text-slate-600">Rain and soil water for {fieldName}</p><p className="mt-1 text-xs text-slate-500">Covers the area around your field, not variation inside it</p></div>
      <div className="flex shrink-0 items-center gap-3"><div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1" aria-label="Water date range">{([30, 90, 180] as Range[]).map((days) => <button key={days} onClick={() => setRange(days)} aria-pressed={range === days} className={`rounded-lg px-3 py-2 text-sm font-bold ${range === days ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-600'}`}>{days}</button>)}</div><button onClick={handleRefresh} disabled={refreshing} aria-label="Refresh water data" className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-700 shadow-sm hover:border-emerald-300"><RefreshCw size={17} className={refreshing ? 'animate-spin' : ''} /></button></div>
      <div className="self-end text-xs text-slate-500">Updated {updatedAt ? formatDate(updatedAt, { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</div>
    </header>

    <div className="grid grid-cols-2 items-stretch gap-5">
      <button onClick={() => setDetail('rain')} aria-pressed={detail === 'rain'} className={`min-h-40 rounded-2xl border bg-white p-6 text-left shadow-sm transition ${detail === 'rain' ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-slate-200 hover:border-emerald-300'}`}>
        <div className="flex items-start justify-between"><div className="flex items-center gap-2 text-sm font-bold text-slate-700"><CloudRain size={18} className="text-sky-700" />Rainfall</div><SourceBadge>NASA GPM</SourceBadge></div>
        {rain.length ? <><div className="mt-5 text-4xl font-extrabold text-slate-950">{formatNumber(rainTotal, { maximumFractionDigits: 1 })} <span className="text-lg font-bold text-slate-500">mm</span></div><p className="mt-2 text-sm text-slate-600">Last rain {daysSinceRain === null ? '—' : `${daysSinceRain} days ago`} · {rainyDays} rainy days</p></> : <p className="mt-5 text-sm font-semibold text-slate-600">No rainfall reading for this period.</p>}
      </button>
      <button onClick={() => setDetail('soil')} aria-pressed={detail === 'soil'} className={`min-h-40 rounded-2xl border bg-white p-6 text-left shadow-sm transition ${detail === 'soil' ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-slate-200 hover:border-emerald-300'}`}>
        <div className="flex items-start justify-between"><div className="flex items-center gap-2 text-sm font-bold text-slate-700"><Droplets size={18} className="text-blue-700" />Soil water</div><SourceBadge>NASA SMAP</SourceBadge></div>
        {latestSoil ? <><div className="mt-5 flex items-baseline gap-3"><span className={`text-3xl font-extrabold ${soilStatus === 'Dry' ? 'text-amber-800' : soilStatus === 'Wet' ? 'text-blue-800' : 'text-emerald-800'}`}>{soilStatus || 'Reading'}</span><span className="text-lg font-bold text-slate-700">{formatNumber(latestSoil.mean_value, { maximumFractionDigits: 3 })} m³/m³</span></div><p className="mt-2 text-sm text-slate-600">{normal ? `Usual range ${formatNumber(normal.p10, { maximumFractionDigits: 3 })}–${formatNumber(normal.p90, { maximumFractionDigits: 3 })} m³/m³` : `Latest reading ${formatDate(latestSoil.observation_date, { dateStyle: 'medium' })}`}</p></> : <p className="mt-5 text-sm font-semibold text-slate-600">No soil water reading in the last {range} days - try 180 days</p>}
      </button>
    </div>

    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center justify-between gap-4"><div><h2 className="text-xl font-extrabold text-slate-950">{detail === 'rain' ? 'Rainfall' : 'Soil water'}</h2><p className="mt-1 text-sm text-slate-600">{detail === 'rain' ? 'Daily rainfall observed around your field' : 'Soil water trend and usual range'}</p></div>{detail === 'rain' && <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">{(['day', 'month'] as const).map((mode) => <button key={mode} onClick={() => setView(mode)} aria-pressed={view === mode} className={`rounded-md px-3 py-1.5 text-xs font-bold capitalize ${view === mode ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-600'}`}>{mode}</button>)}</div>}</div>
      {detail === 'rain' ? <RainChart observations={rain} view={view} formatNumber={formatNumber} /> : <SoilChart observations={soil} range={normal} formatDate={formatDate} formatNumber={formatNumber} />}
      {detail === 'rain' && rain.filter((point) => point.mean_value > 20).length > 0 && <p className="mt-4 text-sm font-semibold text-amber-800">Heavy-rain days (&gt;20 mm): {rain.filter((point) => point.mean_value > 20).length}</p>}
      <details className="mt-5 border-t border-slate-100 pt-4"><summary className="flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-700"><Info size={16} />About this data</summary><div className="mt-3 grid grid-cols-2 gap-3 text-sm text-slate-600"><p><strong>Satellite:</strong> {detail === 'rain' ? data?.gpm?.dataset_info.source || 'NASA GPM' : health?.moisture_trend.available ? health.moisture_trend.sources.modelled?.name || 'NASA SMAP' : data?.smap?.dataset_info.source || 'NASA SMAP'}</p><p><strong>Product:</strong> {detail === 'rain' ? data?.gpm?.dataset_info.product_id || 'GPM_3IMERGDL.07' : 'SPL4SMGP.008'}</p><p><strong>Resolution:</strong> {detail === 'rain' ? data?.gpm?.dataset_info.spatial_resolution || '0.1° daily' : health?.moisture_trend.available ? health.moisture_trend.sources.modelled?.resolution || '9 km, daily' : data?.smap?.dataset_info.spatial_resolution || '9 km'}</p><p><strong>Coverage:</strong> {detail === 'rain' ? data?.gpm?.dataset_info.effective_resolution_note || 'Regional estimate around the field' : 'Root zone (0–100 cm), regional grid cell around the field'}</p><p><strong>Verification date:</strong> {updatedAt ? formatDate(updatedAt, { dateStyle: 'medium' }) : 'Not available'}</p><p><strong>Field:</strong> {fieldName}</p></div></details>
    </section>
  </div>;
}

function ordered(points: EnvironmentalObservationItem[]) { return [...points].sort((a, b) => a.observation_date.localeCompare(b.observation_date)); }
function SourceBadge({ children }: { children: React.ReactNode }) { return <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-600">{children}</span>; }

function RainChart({ observations, view, formatNumber }: { observations: EnvironmentalObservationItem[]; view: 'day' | 'month'; formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string }) {
  const buckets = useMemo(() => {
    const map = new Map<string, { total: number; rainy: number; label: string }>();
    observations.forEach((item) => {
      const date = item.observation_date;
      const key = view === 'day' ? date : date.slice(0, 7);
      const existing = map.get(key) || { total: 0, rainy: 0, label: view === 'day' ? date.slice(5) : new Date(`${key}-01T12:00:00`).toLocaleDateString(undefined, { month: 'short' }) };
      existing.total += Math.max(0, item.mean_value);
      if (item.mean_value > 0) existing.rainy += 1;
      map.set(key, existing);
    });
    return [...map.entries()].map(([key, value]) => ({ key, ...value })).slice(view === 'day' ? -observations.length : -6);
  }, [observations, view]);
  if (!observations.length) return <p className="rounded-xl bg-slate-50 p-8 text-center text-sm font-semibold text-slate-600">No rainfall reading for this period.</p>;
  const peak = Math.max(1, ...buckets.map((point) => point.total));
  const width = Math.max(760, buckets.length * (view === 'day' ? 22 : 125));
  return <div className="overflow-x-auto"><svg role="img" aria-label="Rainfall chart" viewBox={`0 0 ${width} 260`} style={{ width: `${width}px`, maxWidth: 'none' }} className="h-64 min-w-[760px]">
    {[0, 1, 2, 3].map((i) => { const y = 20 + i * 62; return <g key={i}><line x1="42" y1={y} x2={width - 10} y2={y} stroke="#e2e8f0" /><text x="36" y={y + 4} textAnchor="end" fill="#64748b" fontSize="11">{formatNumber(peak * (3 - i) / 3, { maximumFractionDigits: 0 })} mm</text></g>; })}
    {buckets.map((point, i) => { const step = (width - 62) / buckets.length; const barWidth = Math.max(4, step * .68); const height = Math.max(point.total ? 2 : 0, point.total / peak * 182); const x = 48 + i * step + (step - barWidth) / 2; const y = 206 - height; return <g key={point.key}><title>{`${point.key}: ${formatNumber(point.total, { maximumFractionDigits: 1 })} mm${view === 'month' ? ` · ${point.rainy} rainy days` : ''}`}</title><rect x={x} y={y} width={barWidth} height={height} rx="3" fill={point.total > 20 ? '#d99a16' : '#168bb5'} /><text x={x + barWidth / 2} y="226" textAnchor="middle" fill="#475569" fontSize={view === 'day' ? 9 : 11}>{point.label}</text>{view === 'month' && <text x={x + barWidth / 2} y="244" textAnchor="middle" fill="#64748b" fontSize="10">{formatNumber(point.total, { maximumFractionDigits: 0 })} mm – {point.rainy} rainy days</text>}</g>; })}
  </svg></div>;
}

function SoilChart({ observations, range, formatDate, formatNumber }: { observations: { id: string; observation_date: string; mean_value: number; unit: string }[]; range: { p10: number; p90: number } | null; formatDate: (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => string; formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string }) {
  if (!observations.length) return <p className="rounded-xl bg-slate-50 p-8 text-center text-sm font-semibold text-slate-600">No soil water reading for this range. Try a longer range.</p>;
  const sorted = ordered(observations);
  const values = sorted.map((point) => point.mean_value);
  const low = Math.min(...values, range?.p10 ?? Infinity) * .92;
  const high = Math.max(...values, range?.p90 ?? 0) * 1.08;
  const x = (i: number) => 70 + i * (660 / Math.max(1, sorted.length - 1));
  const y = (v: number) => 205 - ((v - low) / Math.max(.001, high - low)) * 165;
  const path = sorted.map((point, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(point.mean_value)}`).join(' ');
  const bandTop = range ? y(range.p90) : null;
  const bandBottom = range ? y(range.p10) : null;
  return <div><svg role="img" aria-label="Soil water trend" viewBox="0 0 760 260" className="h-64 w-full">
    {[0, 1, 2, 3].map((i) => <g key={i}><line x1="70" y1={40 + i * 55} x2="740" y2={40 + i * 55} stroke="#e2e8f0" /><text x="62" y={44 + i * 55} textAnchor="end" fill="#64748b" fontSize="11">{formatNumber(high - (high - low) * i / 3, { maximumFractionDigits: 2 })}</text></g>)}
    {bandTop != null && bandBottom != null && <rect x="70" y={bandTop} width="670" height={Math.max(0, bandBottom - bandTop)} fill="rgba(34,165,90,0.15)" />}
    <path d={path} fill="none" stroke="#2563eb" strokeWidth="3" />
    {sorted.map((point, i) => <circle key={point.id} cx={x(i)} cy={y(point.mean_value)} r="3" fill="#2563eb"><title>{`${formatDate(point.observation_date, { dateStyle: 'medium' })}: ${formatNumber(point.mean_value, { maximumFractionDigits: 3 })} m³/m³`}</title></circle>)}
    <line x1="740" y1="35" x2="740" y2="210" stroke="#1d4ed8" strokeDasharray="4 4" /><text x="736" y="28" textAnchor="end" fill="#1d4ed8" fontSize="11" fontWeight="700">Today</text>
    <text x="70" y="236" fill="#64748b" fontSize="11">{formatDate(sorted[0].observation_date, { month: 'short', day: 'numeric' })}</text><text x="740" y="236" textAnchor="end" fill="#64748b" fontSize="11">{formatDate(sorted[sorted.length - 1].observation_date, { month: 'short', day: 'numeric' })}</text><text x="405" y="254" textAnchor="middle" fill="#475569" fontSize="11">Soil water (m³/m³)</text>
  </svg>{range && <div className="mt-2 flex items-center gap-2 text-xs text-slate-600"><span className="h-3 w-5 rounded-sm bg-emerald-100" />Usual range {formatNumber(range.p10, { maximumFractionDigits: 3 })}–{formatNumber(range.p90, { maximumFractionDigits: 3 })} m³/m³</div>}</div>;
}
