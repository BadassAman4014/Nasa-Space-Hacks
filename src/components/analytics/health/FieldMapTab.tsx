import { useCallback, useEffect, useMemo, useState } from 'react';
import { GeoJSON, ImageOverlay, MapContainer, TileLayer, ZoomControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import { AlertTriangle, CloudRain, Droplets, HeartPulse, Info as InfoIcon, Loader2, ShieldCheck, Sprout, Wind } from 'lucide-react';
import {
  fieldHealthApi,
  type FieldCard,
  type HealthTrend,
  type MapField,
  type OverlayResponse,
  type Provenance,
  type RasterLayer,
  type RiskFactor,
} from '../../../services/fieldHealthApi';
import { useI18n } from '../../../i18n';
import { COLOUR_HEX, Info, InfoRow, LIGHT, SourceTag, TrafficLight, UnavailableNote } from './HealthUi';

type MapLayer = 'water' | 'nitrogen' | 'nutrientLoss' | 'risk';
type ApiLayer = 'moisture' | 'nitrogen' | 'leaching';

const API_LAYER: Partial<Record<MapLayer, ApiLayer>> = {
  water: 'moisture',
  nitrogen: 'nitrogen',
  nutrientLoss: 'leaching',
};

const SHORT_LEGEND: Record<string, { title: string; items: { colour: string; label: string }[] }> = {
  ndmi: { title: 'Plant water', items: [{ colour: 'red', label: 'Low' }, { colour: 'yellow', label: 'Medium' }, { colour: 'green', label: 'High' }] },
  ndre: { title: 'Nitrogen uptake', items: [{ colour: 'red', label: 'Low' }, { colour: 'yellow', label: 'Medium' }, { colour: 'green', label: 'High' }] },
  ecostress_esi: { title: 'Water stress', items: [{ colour: 'red', label: 'Stressed' }, { colour: 'yellow', label: 'Moderate' }, { colour: 'green', label: 'OK' }, { colour: 'blue', label: 'Wet' }] },
};

function FitTo({ bounds }: { bounds: L.LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [44, 44], maxZoom: 16 });
  }, [bounds, map]);
  return null;
}

function outsideMask(geometry: any) {
  if (!geometry?.coordinates) return null;
  const holes = geometry.type === 'Polygon'
    ? [geometry.coordinates[0]]
    : geometry.coordinates.map((polygon: any[]) => polygon[0]);
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'Polygon' as const,
      coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]], ...holes],
    },
  };
}

export function FieldMapTab({
  fieldId,
  onSelectField,
  onOpenInputs,
  initialLayer = 'water',
}: {
  fieldId: string;
  onSelectField?: (id: string) => void;
  onOpenHealth: () => void;
  onOpenInputs: () => void;
  initialLayer?: MapLayer;
}) {
  const { t, formatDate, formatNumber } = useI18n();
  const [fields, setFields] = useState<MapField[] | null>(null);
  const [card, setCard] = useState<FieldCard | null>(null);
  const [trend, setTrend] = useState<HealthTrend | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeLayer, setActiveLayer] = useState<MapLayer>(initialLayer);
  const [overlays, setOverlays] = useState<Partial<Record<ApiLayer, OverlayResponse | 'loading' | { error: string }>>>({});
  const [attentionHover, setAttentionHover] = useState<string | null>(null);

  const loadLayer = useCallback((layer: MapLayer) => {
    const apiLayer = API_LAYER[layer];
    if (!apiLayer || overlays[apiLayer]) return;
    setOverlays((current) => ({ ...current, [apiLayer]: 'loading' }));
    fieldHealthApi.getOverlay(fieldId, apiLayer)
      .then((result) => setOverlays((current) => ({ ...current, [apiLayer]: result })))
      .catch((reason) => setOverlays((current) => ({ ...current, [apiLayer]: { error: reason instanceof Error ? reason.message : String(reason) } })));
  }, [fieldId, overlays]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setActiveLayer(initialLayer);
    setOverlays({ moisture: 'loading' });
    Promise.all([
      fieldHealthApi.getMap(false),
      fieldHealthApi.getCard(fieldId),
      fieldHealthApi.getTrend(fieldId, false),
      fieldHealthApi.getOverlay(fieldId, 'moisture'),
    ]).then(([mapFields, fieldCard, healthTrend, moisture]) => {
      if (!active) return;
      setFields(mapFields);
      setCard(fieldCard);
      setTrend(healthTrend);
      setOverlays({ moisture });
    }).catch((reason) => active && setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [fieldId]);

  const activateLayer = (layer: MapLayer) => {
    setActiveLayer(layer);
    loadLayer(layer);
  };

  const selected = fields?.find((field) => field.field_id === fieldId) ?? null;
  const selectedBounds = useMemo(() => selected ? L.geoJSON(selected.geometry).getBounds() : null, [selected]);
  const mask = useMemo(() => selected ? outsideMask(selected.geometry) : null, [selected]);
  const apiLayer = API_LAYER[activeLayer];
  const overlayState = apiLayer ? overlays[apiLayer] : undefined;
  const overlay = overlayState && overlayState !== 'loading' && !('error' in overlayState) ? overlayState : null;
  const raster = overlay?.available && overlay.layer && 'available' in overlay.layer && overlay.layer.available ? overlay.layer as RasterLayer : null;
  const wholeFieldLevel = activeLayer === 'nutrientLoss' ? overlay?.level : activeLayer === 'risk' ? highestRisk(trend) : null;
  const updatedDate = raster?.date || card?.generated_at || null;
  const stale = updatedDate ? Date.now() - new Date(updatedDate).getTime() > 7 * 86400000 : false;

  const layers: { id: MapLayer; label: string; tooltip: string }[] = [
    { id: 'water', label: t('fieldAnalytics.layers.water'), tooltip: t('fieldAnalytics.layers.waterTip') },
    { id: 'nitrogen', label: t('fieldAnalytics.layers.nitrogen'), tooltip: t('fieldAnalytics.layers.nitrogenTip') },
    { id: 'nutrientLoss', label: t('fieldAnalytics.layers.nutrientLoss'), tooltip: t('fieldAnalytics.layers.nutrientLossTip') },
    { id: 'risk', label: t('fieldAnalytics.layers.risk'), tooltip: t('fieldAnalytics.layers.riskTip') },
  ];

  return (
    <div className="min-w-0 space-y-6">
      {loading && <KpiSkeleton />}
      {error && <UnavailableNote data={{ reason: error }} />}
      {!loading && card && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:gap-6" aria-label="Field indicators">
          <KpiCards card={card} activeLayer={activeLayer} onActivate={activateLayer} onOpenInputs={onOpenInputs} formatNumber={formatNumber} t={t} />
        </div>
      )}

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="relative isolate min-h-[520px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 shadow-sm sm:min-h-[620px]" aria-label="Field map">
          <MapContainer center={[51.77, 14.28]} zoom={13} className="h-[520px] w-full sm:h-[620px]" zoomControl={false}>
            <ZoomControl position="bottomright" />
            <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="Imagery © Esri, Maxar, Earthstar Geographics" maxZoom={19} />
            {fields?.map((field) => {
              const isSelected = field.field_id === fieldId;
              return (
                <GeoJSON
                  key={`${field.field_id}-${activeLayer}-${attentionHover}`}
                  data={field.geometry}
                  style={{
                    color: isSelected ? (attentionHover ? '#f59e0b' : '#ffffff') : '#94a3b8',
                    weight: isSelected ? 4 : 1.5,
                    fillColor: isSelected && wholeFieldLevel ? LIGHT[wholeFieldLevel].fill : '#1fa35b',
                    fillOpacity: isSelected && !raster ? 0.38 : 0,
                  }}
                  eventHandlers={{ click: () => onSelectField?.(field.field_id) }}
                />
              );
            })}
            {raster && <ImageOverlay url={raster.png} bounds={raster.bounds} opacity={0.9} zIndex={400} />}
            {mask && <GeoJSON data={mask as any} style={{ color: 'transparent', fillColor: '#07120c', fillOpacity: 0.42, fillRule: 'evenodd' }} interactive={false} />}
            <FitTo bounds={selectedBounds} />
          </MapContainer>

          <div className="absolute left-3 top-3 z-[500] flex max-w-[calc(100%-1.5rem)] overflow-x-auto rounded-xl border border-white/70 bg-white/95 p-1 shadow-lg backdrop-blur sm:left-4 sm:top-4" role="group" aria-label="Map layer">
            {layers.map((layer) => (
              <button key={layer.id} onClick={() => activateLayer(layer.id)} title={layer.tooltip} aria-pressed={activeLayer === layer.id} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-extrabold transition ${activeLayer === layer.id ? 'bg-emerald-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}>
                {layer.label}
              </button>
            ))}
          </div>

          <div className="absolute bottom-4 left-4 z-[500] max-w-[calc(100%-5rem)] rounded-xl border border-slate-200 bg-white/95 p-3 text-xs shadow-lg backdrop-blur" aria-label={t('fieldAnalytics.map.legend')}>
            <ActiveLegend layer={activeLayer} state={overlayState} trend={trend} />
            {updatedDate && (
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2 text-xs text-slate-600">
                <span>{t('fieldAnalytics.map.updated', { date: formatDate(updatedDate) })}</span>
                {stale && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-800"><AlertTriangle size={12} />{t('fieldAnalytics.map.oldData')}</span>}
              </div>
            )}
          </div>
        </section>

        <NeedsAttention trend={trend} card={card} activeId={attentionHover} onFocus={(id) => { setAttentionHover(id); setActiveLayer(id === 'moisture' ? 'water' : 'risk'); }} />
      </div>
    </div>
  );
}

function KpiSkeleton() {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:gap-6" aria-label="Loading indicators">{[0, 1, 2, 3].map((item) => <div key={item} className="h-44 animate-pulse rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="h-4 w-24 rounded bg-slate-100" /><div className="mt-6 h-9 w-20 rounded bg-slate-100" /><div className="mt-4 h-4 w-32 rounded bg-slate-100" /></div>)}</div>;
}

function KpiCard({ label, value, detail, source, icon, tone, active, onClick, info, action }: { label: string; value: React.ReactNode; detail: React.ReactNode; source?: Provenance | string; icon: React.ReactNode; tone: 'red' | 'yellow' | 'green' | 'blue' | 'grey'; active: boolean; onClick: () => void; info: React.ReactNode; action?: React.ReactNode }) {
  const { t } = useI18n();
  const colours = { red: 'bg-red-500 text-red-700', yellow: 'bg-amber-500 text-amber-800', green: 'bg-emerald-600 text-emerald-700', blue: 'bg-blue-500 text-blue-700', grey: 'bg-slate-400 text-slate-600' }[tone];
  return (
    <article onClick={onClick} className={`flex min-h-44 cursor-pointer flex-col rounded-2xl border bg-white p-6 shadow-sm transition focus-within:ring-2 focus-within:ring-emerald-600 ${active ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-slate-200 hover:border-emerald-300'}`}>
      <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2 text-sm font-bold text-slate-700"><span className={`grid h-8 w-8 place-items-center rounded-full bg-opacity-10 ${colours.split(' ')[1]}`}>{icon}</span>{label}</div><SourceTag p={source} /></div>
      <div className="mt-4 flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${colours.split(' ')[0]}`} /><div className="text-[30px] font-extrabold leading-none text-slate-950">{value}</div><Info label={t('fieldAnalytics.kpi.about', { label })}>{info}</Info></div>
      <div className="mt-2 text-sm leading-snug text-slate-600">{detail}</div>
      {action && <div className="mt-auto pt-3" onClick={(event) => event.stopPropagation()}>{action}</div>}
    </article>
  );
}

function KpiCards({ card, activeLayer, onActivate, onOpenInputs, formatNumber, t }: { card: FieldCard; activeLayer: MapLayer; onActivate: (layer: MapLayer) => void; onOpenInputs: () => void; formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string; t: (key: string, params?: Record<string, string | number>) => string }) {
  const moisture: any = card.moisture;
  const rain: any = card.rain;
  const soil: any = card.soil_health;
  const nitrogen = card.nitrogen;
  return <>
    <KpiCard label={t('fieldAnalytics.kpi.moisture')} value={moisture.available ? (moisture.class === 'red' ? t('fieldAnalytics.kpi.low') : moisture.class === 'yellow' ? t('fieldAnalytics.kpi.medium') : t('fieldAnalytics.kpi.ok')) : '—'} detail={moisture.available ? (moisture.class === 'red' ? t('fieldAnalytics.kpi.dry') : moisture.class === 'yellow' ? t('fieldAnalytics.kpi.slightlyDry') : t('fieldAnalytics.kpi.usualMoisture')) : moisture.reason} source={moisture.provenance} icon={<Droplets size={17} />} tone={moisture.available ? moisture.class : 'grey'} active={activeLayer === 'water'} onClick={() => onActivate('water')} info={moisture.available ? <><InfoRow k={t('fieldAnalytics.kpi.rootZone')}>{formatNumber(moisture.rootzone_m3m3, { maximumFractionDigits: 2 })} m³/m³</InfoRow><InfoRow k={t('fieldAnalytics.kpi.source')}>{moisture.source}</InfoRow></> : moisture.reason} />
    <KpiCard label={t('fieldAnalytics.kpi.rain')} value={rain.available ? (rain.days_since_rain ?? '>365') : '—'} detail={rain.available ? t('fieldAnalytics.kpi.rainRecent', { amount: formatNumber(rain.rain_7d_mm, { maximumFractionDigits: 1 }) }) : rain.reason} source={rain.provenance} icon={<CloudRain size={17} />} tone={rain.available && rain.days_since_rain > 14 ? 'yellow' : rain.available ? 'blue' : 'grey'} active={activeLayer === 'nutrientLoss'} onClick={() => onActivate('nutrientLoss')} info={rain.available ? <><InfoRow k={t('fieldAnalytics.kpi.value')}>{rain.days_since_rain} {t('fieldAnalytics.kpi.days')}</InfoRow><InfoRow k={t('fieldAnalytics.kpi.source')}>{rain.source}</InfoRow></> : rain.reason} />
    <KpiCard label={t('fieldAnalytics.kpi.health')} value={soil.available ? `${formatNumber(soil.score)}/100` : '—'} detail={soil.available ? `${soil.label} · ${t('fieldAnalytics.health.weakest', { factor: soil.weakest.replace(/ \(.*\)/, '').toLowerCase() })}` : soil.reason} source={soil.provenance} icon={<HeartPulse size={17} />} tone={soil.available ? (soil.score >= 80 ? 'green' : soil.score >= 60 ? 'yellow' : 'red') : 'grey'} active={activeLayer === 'risk'} onClick={() => onActivate('risk')} info={soil.available ? <><InfoRow k="Method">{soil.method}</InfoRow><InfoRow k="Source">{soil.source}</InfoRow></> : soil.reason} />
    <KpiCard label={t('fieldAnalytics.kpi.nitrogen')} value={nitrogen.available ? formatNumber(nitrogen.remaining_kg_n_ha ?? nitrogen.estimate_kg_n_ha ?? 0) : '—'} detail={nitrogen.available ? t('fieldAnalytics.kpi.nitrogenRemaining') : nitrogen.reason || t('fieldAnalytics.kpi.unavailable')} source={nitrogen.available ? 'derived' : 'farmer_input'} icon={<Sprout size={17} />} tone={nitrogen.available ? 'blue' : 'grey'} active={activeLayer === 'nitrogen'} onClick={() => onActivate('nitrogen')} info={<p>{t('fieldAnalytics.kpi.nitrogenEstimate')}</p>} action={!nitrogen.available ? <button onClick={onOpenInputs} className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-emerald-700">{t('fieldAnalytics.kpi.addCrop')}</button> : undefined} />
  </>;
}

function highestRisk(trend: HealthTrend | null): 'red' | 'yellow' | 'green' | null {
  if (!trend) return null;
  const levels = [trend.erosion.available ? trend.erosion.level : null, trend.leaching.available ? trend.leaching.level : null];
  return levels.includes('red') ? 'red' : levels.includes('yellow') ? 'yellow' : levels.includes('green') ? 'green' : null;
}

function ActiveLegend({ layer, state, trend }: { layer: MapLayer; state: OverlayResponse | 'loading' | { error: string } | undefined; trend: HealthTrend | null }) {
  const { t } = useI18n();
  if (layer === 'risk') {
    const level = highestRisk(trend) || 'grey';
    return <div className="flex items-center gap-2"><ShieldCheck size={15} className={LIGHT[level].text} /><strong>{t('fieldAnalytics.layers.risk')}</strong><span className={`h-2.5 w-2.5 rounded-full ${LIGHT[level].dot}`} /><span>{riskWord(level, t)}</span></div>;
  }
  if (!state || state === 'loading') return <div className="flex items-center gap-2 text-slate-600"><Loader2 size={14} className="animate-spin" />{t('fieldAnalytics.map.loading')}</div>;
  if ('error' in state) return <div className="flex items-center gap-2 text-slate-600"><AlertTriangle size={14} />{t('fieldAnalytics.map.unavailable')}</div>;
  if (layer === 'nutrientLoss') {
    const level = state.level || 'grey';
    return <div className="flex items-center gap-2"><AlertTriangle size={15} className={LIGHT[level].text} /><strong>{t('fieldAnalytics.layers.nutrientLoss')}</strong><span className={`h-2.5 w-2.5 rounded-full ${LIGHT[level].dot}`} /><span>{riskWord(level, t)}</span></div>;
  }
  const raster = state.available && state.layer && 'available' in state.layer && state.layer.available ? state.layer as RasterLayer : null;
  if (!raster) return <div className="text-slate-600">{state.reason || t('fieldAnalytics.map.unavailable')}</div>;
  const legend = SHORT_LEGEND[raster.kind];
  return <div><div className="mb-2 flex items-center gap-2 font-bold text-slate-900">{layer === 'water' ? <Droplets size={15} /> : <Sprout size={15} />}{legend?.title || raster.title}</div><div className="flex flex-wrap gap-3">{(legend?.items || raster.legend).map((item) => <span key={item.label} className="flex items-center gap-1.5 text-slate-700"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLOUR_HEX[item.colour] || item.colour }} />{item.label}</span>)}</div></div>;
}

function NeedsAttention({ trend, card, activeId, onFocus }: { trend: HealthTrend | null; card: FieldCard | null; activeId: string | null; onFocus: (id: string | null) => void }) {
  const { t } = useI18n();
  if (!trend || !card) return <aside className="h-72 animate-pulse rounded-2xl bg-white shadow-sm" />;
  const items: { id: string; level: 'red' | 'yellow' | 'green'; title: string; action: string; factors: RiskFactor[]; icon: React.ReactNode }[] = [];
  if (card.moisture.available && card.moisture.class !== 'green') items.push({ id: 'moisture', level: card.moisture.class, title: t('fieldAnalytics.needs.dryArea'), action: t('fieldAnalytics.needs.reviewWater'), factors: [{ factor: 'Root zone', value: `${card.moisture.rootzone_m3m3} m³/m³` }], icon: <Droplets size={18} /> });
  if (trend.erosion.available && trend.erosion.level !== 'green') items.push({ id: 'erosion', level: trend.erosion.level, title: t('fieldAnalytics.needs.erosion', { level: riskWord(trend.erosion.level, t), type: t(`fieldAnalytics.needs.${trend.erosion.dominant}`) }), action: localizeRiskAction(trend.erosion.recommendation, t), factors: trend.erosion.factors, icon: <Wind size={18} /> });
  if (trend.leaching.available && trend.leaching.level !== 'green') items.push({ id: 'leaching', level: trend.leaching.level, title: t('fieldAnalytics.needs.nutrientLoss', { level: riskWord(trend.leaching.level, t) }), action: t('fieldAnalytics.needs.lossAction'), factors: trend.leaching.factors, icon: <AlertTriangle size={18} /> });
  const order = { red: 0, yellow: 1, green: 2 };
  items.sort((a, b) => order[a.level] - order[b.level]);
  return <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:sticky xl:top-32 xl:h-fit"><h2 className="text-xl font-extrabold text-slate-950">{t('fieldAnalytics.needs.title')}</h2>{items.length === 0 ? <div className="mt-5 flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800"><ShieldCheck size={18} />{t('fieldAnalytics.needs.noRisks')}</div> : <div className="mt-4 space-y-3">{items.map((item) => <article key={item.id} tabIndex={0} onMouseEnter={() => onFocus(item.id)} onMouseLeave={() => onFocus(null)} onClick={() => onFocus(item.id)} className={`rounded-xl border p-4 transition ${activeId === item.id ? 'border-amber-400 ring-2 ring-amber-200' : LIGHT[item.level].bg}`}><div className="flex gap-3"><TrafficLight level={item.level} /><div className="min-w-0"><div className={`flex items-center gap-2 text-sm font-extrabold ${LIGHT[item.level].text}`}>{item.icon}{item.title}</div><p className="mt-1 text-sm leading-snug text-slate-700">{item.action}</p></div></div>{item.factors.length > 0 && <details className="mt-3"><summary className="cursor-pointer text-sm font-bold text-slate-700">{t('fieldAnalytics.needs.why')}</summary><div className="mt-2 flex flex-wrap gap-1.5">{item.factors.slice(0, 4).map((factor) => <span key={`${factor.factor}-${factor.value}`} className="rounded-full bg-white/80 px-2 py-1 text-xs font-semibold text-slate-700">{translateRiskFactor(factor.factor, t)}: {factor.value.split(',')[0]}</span>)}</div></details>}</article>)}</div>}</aside>;
}

function riskWord(level: string, t: (key: string) => string) {
  const key = level === 'green' ? 'levelLow' : level === 'yellow' ? 'levelModerate' : level === 'red' ? 'levelHigh' : 'levelUnknown';
  return t(`fieldAnalytics.needs.${key}`);
}

function localizeRiskAction(action: string, t: (key: string) => string) {
  const normalized = action.toLowerCase();
  if (normalized.startsWith('keep the soil covered')) return t('fieldAnalytics.needs.coverSoil');
  if (normalized.startsWith('protect exposed soil')) return t('fieldAnalytics.needs.protectSoil');
  return action;
}

function translateRiskFactor(factor: string, t: (key: string) => string) {
  if (factor === 'Sandy topsoil') return t('fieldAnalytics.needs.sandyTopsoil');
  if (factor === 'Heavy rain days') return t('fieldAnalytics.needs.heavyRainDays');
  if (factor === 'Root zone') return t('fieldAnalytics.kpi.rootZone');
  return factor;
}
