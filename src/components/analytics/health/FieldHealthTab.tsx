import { useCallback, useEffect, useState } from 'react';
import { GeoJSON, ImageOverlay, MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { AlertTriangle, ArrowRight, ArrowUpRight, CheckCircle2, Info as InfoIcon, Lightbulb, Loader2, RefreshCw } from 'lucide-react';
import { fieldHealthApi, type ActionCard, type HealthTrend, type MoistureTrend, type VegetationTrend, type YieldZones } from '../../../services/fieldHealthApi';
import { useI18n } from '../../../i18n';
import { FieldSoilCard } from '../../dashboard/FieldSoilCard';
import { Info, InfoRow, LineChart, SourceTag, UnavailableNote } from './HealthUi';

export function FieldHealthTab({ fieldId, notify }: { fieldId: string; notify: (message: string) => void }) {
  const { t } = useI18n();
  const [data, setData] = useState<HealthTrend | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((refresh = false) => {
    setLoading(true);
    setError(null);
    fieldHealthApi.getTrend(fieldId, refresh)
      .then(setData)
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setLoading(false));
  }, [fieldId]);

  useEffect(() => { setData(null); load(false); }, [load]);

  if (loading && !data) return <HealthSkeleton />;
  if (error || !data) return <div className="space-y-4"><UnavailableNote data={{ reason: error || 'Field health did not load.' }} /><button onClick={() => load(false)} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white">Retry</button></div>;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex justify-end"><button onClick={() => load(true)} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm hover:border-emerald-300"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />{t('fieldAnalytics.health.refresh')}</button></div>
      <OverallHealth data={data} />
      <Actions actions={data.actions} />
      <section>
        <h2 className="mb-4 text-xl font-extrabold text-slate-950">{t('fieldAnalytics.health.changing')}</h2>
        <div className="grid grid-cols-1 items-stretch gap-6 xl:grid-cols-2">
          <Vegetation value={data.vegetation_trend} />
          <Moisture value={data.moisture_trend} />
        </div>
      </section>
      <Zones value={data.yield_zones} geometry={data.card.geometry} />
      <FieldSoilCard fieldId={fieldId} fieldName={data.card.name} fieldAreaHa={data.card.area_ha} notify={notify} title={t('fieldAnalytics.health.soilProfile')} />
    </div>
  );
}

function HealthSkeleton() {
  return <div className="space-y-6" aria-label="Loading field health"><div className="h-48 animate-pulse rounded-2xl bg-white" /><div className="h-56 animate-pulse rounded-2xl bg-white" /><div className="grid grid-cols-1 gap-6 xl:grid-cols-2"><div className="h-80 animate-pulse rounded-2xl bg-white" /><div className="h-80 animate-pulse rounded-2xl bg-white" /></div></div>;
}

function OverallHealth({ data }: { data: HealthTrend }) {
  const { t, formatNumber } = useI18n();
  const soil: any = data.card.soil_health;
  if (!soil.available) return <Card title={t('fieldAnalytics.health.overall')}><UnavailableNote data={soil} /></Card>;
  const good = soil.score >= 80;
  return (
    <Card title={t('fieldAnalytics.health.overall')} source="derived">
      <div className="grid gap-5 md:grid-cols-[auto_1fr] md:items-center">
        <div className="flex items-center gap-4"><div className={`grid h-24 w-24 place-items-center rounded-full border-8 ${good ? 'border-emerald-100 text-emerald-700' : 'border-amber-100 text-amber-800'}`}><span className="text-3xl font-extrabold">{formatNumber(soil.score)}</span><span className="-mt-5 text-xs font-bold">/100</span></div><div><span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-extrabold ${good ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{good ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}{good ? t('fieldAnalytics.healthCopy.goodLabel') : soil.label}</span><p className="mt-2 text-xs text-slate-500">{t('fieldAnalytics.health.trendUnavailable')}</p></div></div>
        <div><p className="text-base leading-relaxed text-slate-700">{good ? t('fieldAnalytics.health.verdictGood') : t('fieldAnalytics.health.verdictWatch')}</p><div className="mt-3 inline-flex rounded-xl bg-amber-50 px-3 py-2 text-sm font-extrabold text-amber-900">{t('fieldAnalytics.health.weakest', { factor: localizeSoilFactor(soil.weakest, t) })}</div></div>
      </div>
    </Card>
  );
}

function Actions({ actions }: { actions: ActionCard[] }) {
  const { t } = useI18n();
  const shown = [...actions].sort((a, b) => a.priority - b.priority).slice(0, 5);
  const now = shown.filter((action) => action.priority === 1);
  const later = shown.filter((action) => action.priority !== 1);
  return <Card title={t('fieldAnalytics.health.whatToDo')}>{shown.length === 0 ? <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800"><CheckCircle2 size={17} />{t('fieldAnalytics.health.nothing')}</div> : <div className={`grid gap-6 ${now.length && later.length ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>{now.length > 0 && <ActionGroup title={t('fieldAnalytics.health.doNow')} actions={now} urgent />}{later.length > 0 && <ActionGroup title={t('fieldAnalytics.health.keepInMind')} actions={later} />}</div>}</Card>;
}

function localizeAction(action: ActionCard, t: (key: string, params?: Record<string, string | number>) => string) {
  const title = action.title.toLowerCase();
  if (title === 'soil drier than usual') return { title: t('fieldAnalytics.health.dryActionTitle'), body: t('fieldAnalytics.health.dryActionBody') };
  if (title.includes('blocking period')) {
    const date = action.body.match(/until\s+(.+?)\s+\(/i)?.[1] || '31 January';
    return { title: t('fieldAnalytics.health.fertilizerBlockTitle'), body: t('fieldAnalytics.health.fertilizerBlockBody', { date }) };
  }
  const erosion = action.title.match(/^(High|Moderate) (wind|water) erosion risk$/i);
  if (erosion) {
    const level = t(erosion[1].toLowerCase() === 'high' ? 'fieldAnalytics.needs.levelHigh' : 'fieldAnalytics.needs.levelModerate');
    const type = t(`fieldAnalytics.needs.${erosion[2].toLowerCase()}`);
    const body = action.body.toLowerCase().startsWith('keep the soil covered')
      ? t('fieldAnalytics.needs.coverSoil')
      : action.body.toLowerCase().startsWith('protect exposed soil')
        ? t('fieldAnalytics.needs.protectSoil')
        : action.body;
    return { title: t('fieldAnalytics.health.erosionActionTitle', { level, type }), body };
  }
  if (title.startsWith('spring green-up is weaker')) {
    const year = action.title.match(/\b20\d{2}\b/)?.[0] || '';
    return { title: t('fieldAnalytics.health.springGreenTitle'), body: t('fieldAnalytics.health.springGreenBody', { year }) };
  }
  if (title === 'nitrate leaching risk') return { title: t('fieldAnalytics.health.nitrateRiskTitle'), body: action.body };
  if (title === 'good window to sow a cover crop') return { title: t('fieldAnalytics.health.coverCropTitle'), body: action.body };
  if (title === 'check lime need') return { title: t('fieldAnalytics.health.limeTitle'), body: action.body };
  if (title === 'build organic matter') return { title: t('fieldAnalytics.health.organicMatterTitle'), body: action.body };
  return { title: action.title, body: action.body };
}

function localizeSoilFactor(factor: string, t: (key: string) => string) {
  const value = factor.toLowerCase();
  if (value.includes('compaction')) return t('fieldAnalytics.healthCopy.weakestCompaction');
  if (value.includes('soil reaction') || value.includes('ph')) return t('fieldAnalytics.healthCopy.weakestSoilReaction');
  if (value.includes('organic carbon')) return t('fieldAnalytics.healthCopy.weakestOrganicCarbon');
  if (value.includes('nutrient holding') || value.includes('cec')) return t('fieldAnalytics.healthCopy.weakestNutrientHolding');
  return factor;
}

function localizeTrendStatus(status: string, t: (key: string) => string) {
  if (status === 'stable') return t('fieldAnalytics.healthCopy.stable');
  if (status === 'improving') return t('fieldAnalytics.healthCopy.improving');
  if (status === 'declining') return t('fieldAnalytics.healthCopy.declining');
  return status;
}

function ActionGroup({ title, actions, urgent = false }: { title: string; actions: ActionCard[]; urgent?: boolean }) {
  const { t, formatDate } = useI18n();
  return (
    <div>
      <h3 className="mb-3 text-sm font-extrabold text-slate-900">{title}</h3>
      {actions.length > 0 && (
        <div className="space-y-3">
          {actions.map((action, index) => {
            const display = localizeAction(action, t);
            const blockingEnd = action.title.toLowerCase().includes('blocking period')
              ? action.body.match(/until\s+(.+?)\s+\(/i)?.[1]
              : null;
            const localDate = blockingEnd ? new Date(`${blockingEnd} ${new Date().getFullYear()}`) : null;
            const endDate = localDate && !Number.isNaN(localDate.getTime())
              ? formatDate(localDate, { day: 'numeric', month: 'long' })
              : blockingEnd;
            return (
              <article key={`${action.title}-${index}`} className={`flex gap-3 rounded-xl border p-4 ${urgent ? 'border-red-200 bg-red-50/50' : 'border-slate-200 bg-slate-50'}`}>
                {urgent ? <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-600" /> : <Lightbulb size={18} className="mt-0.5 shrink-0 text-amber-600" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-extrabold text-slate-950">{display.title}</h4>
                    <Info label="Why this"><div className="space-y-1">{action.evidence.map((item) => <p key={item}>• {item}</p>)}</div></Info>
                  </div>
                  {endDate && <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">{t('fieldAnalytics.health.blockingEnds', { date: endDate })}</span>}
                  <p className="mt-1 text-sm leading-snug text-slate-700">{display.body}</p>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Card({ title, source, right, children }: { title: string; source?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="mb-5 flex items-start justify-between gap-4"><h2 className="text-xl font-extrabold text-slate-950">{title}</h2><div className="flex items-center gap-2">{right}<SourceTag p={source} /></div></div>{children}</section>;
}

function Vegetation({ value }: { value: VegetationTrend | { available: false; reason: string } }) {
  const { t, formatNumber } = useI18n();
  if (!value.available) return <Card title={t('fieldAnalytics.health.greenness')}><UnavailableNote data={value} /></Card>;
  const trend = value.trend;
  return <Card title={t('fieldAnalytics.health.greenness')} source="satellite_estimate" right={<><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">3Y</span>{trend.available && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800"><ArrowRight size={13} />{trend.status}</span>}<Info label="About plant greenness"><InfoRow k="Measure">{t('fieldAnalytics.health.technicalNdvi')}</InfoRow></Info></>}><div className="min-h-56"><LineChart yMin={0} yMax={1} series={[{ name: 'NDVI', colour: '#168653', points: value.series.map((point) => ({ x: point.date, y: point.mean_ndvi })) }]} /></div><div className="mt-3 flex flex-wrap gap-2">{value.season_peaks.map((peak) => <span key={peak.season} className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{peak.season}: {formatNumber(peak.peak_ndvi, { maximumFractionDigits: 2 })}</span>)}</div></Card>;
}

function Moisture({ value }: { value: MoistureTrend | { available: false; reason: string } }) {
  const { t, formatNumber } = useI18n();
  if (!value.available) return <Card title={t('fieldAnalytics.health.moisture')}><UnavailableNote data={value} /></Card>;
  const used = value.measured.filter((point) => point.used);
  const last = value.modelled[value.modelled.length - 1];
  const range = value.usual_range;
  const below = Boolean(range && last && last.rootzone_m3m3 < range.p10);
  const above = Boolean(range && last && last.rootzone_m3m3 > range.p90);
  const top = Math.max(0.15, ...value.modelled.map((point) => point.rootzone_m3m3), ...(range ? [range.p90] : [])) * 1.15;
  const status = range ? below ? t('fieldAnalytics.health.belowUsual', { from: formatNumber(range.p10, { maximumFractionDigits: 2 }), to: formatNumber(range.p90, { maximumFractionDigits: 2 }) }) : above ? t('fieldAnalytics.health.aboveUsual') : t('fieldAnalytics.health.withinUsual') : '';
  return <Card title={t('fieldAnalytics.health.moisture')} source="modelled" right={<><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">30D</span><Info label="About soil moisture"><InfoRow k="Units">m³/m³, root zone 0–100 cm</InfoRow></Info></>}><div className="relative min-h-56"><LineChart yMin={0} yMax={top} decimals={2} unitLabel="m³/m³" marker={last ? { x: last.date, label: t('fieldAnalytics.health.today') } : undefined} band={range ? { from: range.p10, to: range.p90, colour: 'rgba(34,165,90,0.16)' } : undefined} series={[{ name: 'Root zone', colour: '#2563eb', points: value.modelled.map((point) => ({ x: point.date, y: point.rootzone_m3m3 })) }, ...(used.length ? [{ name: 'Surface', colour: '#0f766e', style: 'dots' as const, points: used.map((point) => ({ x: point.date, y: point.value_m3m3 })) }] : [])]} /></div>{status && <div className={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold ${below ? 'bg-red-50 text-red-800' : above ? 'bg-blue-50 text-blue-800' : 'bg-emerald-50 text-emerald-800'}`}>{below ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}{status}</div>}</Card>;
}

function FitBounds({ geometry }: { geometry: any }) { const map = useMap(); useEffect(() => { if (geometry) map.fitBounds(L.geoJSON(geometry).getBounds(), { padding: [20, 20] }); }, [geometry, map]); return null; }
const ZONE_COLOUR = { high: '#168653', medium: '#d99a16', low: '#d6453d' } as const;

function Zones({ value, geometry }: { value: YieldZones | { available: false; reason: string }; geometry: any }) {
  const { t, formatNumber } = useI18n();
  if (!value.available) return <Card title={t('fieldAnalytics.health.productivity')}><UnavailableNote data={value} /></Card>;
  return <Card title={t('fieldAnalytics.health.productivity')} source="derived" right={<Info label="About productivity zones"><InfoRow k="Method">{value.method}</InfoRow><InfoRow k="Caveat">{value.caveat}</InfoRow></Info>}><p className="mb-4 text-sm text-slate-600">{t('fieldAnalytics.health.productivityHelp')}</p><div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]"><div className="relative h-72 overflow-hidden rounded-xl border border-slate-200"><MapContainer center={[51.77, 14.28]} zoom={15} className="h-full w-full" zoomControl={false} attributionControl={false}><TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={19} /><ImageOverlay url={value.map_url} bounds={value.bounds} opacity={0.85} /><GeoJSON data={geometry} style={{ color: '#fff', weight: 3, fillOpacity: 0 }} /><FitBounds geometry={geometry} /></MapContainer></div><div className="flex flex-col justify-center gap-5">{value.zones.map((zone) => <div key={zone.zone}><div className="flex items-center justify-between text-sm"><span className="flex items-center gap-2 font-extrabold text-slate-900"><span className="h-3 w-3 rounded-sm" style={{ background: ZONE_COLOUR[zone.zone] }} />{t(`fieldAnalytics.health.${zone.zone}`)}</span><span className="font-semibold text-slate-600">{formatNumber(zone.area_ha, { maximumFractionDigits: 2 })} ha · {formatNumber(zone.percent_of_field, { maximumFractionDigits: 1 })}%</span></div><div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${zone.percent_of_field}%`, background: ZONE_COLOUR[zone.zone] }} /></div></div>)}</div></div></Card>;
}
