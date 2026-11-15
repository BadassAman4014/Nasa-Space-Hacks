import React, { useCallback, useEffect, useState } from 'react';
import { GeoJSON, ImageOverlay, MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Check, Lightbulb, Loader2, RefreshCw, Sprout } from 'lucide-react';
import {
  fieldHealthApi,
  type ErosionRisk,
  type FarmerInputs,
  type HealthTrend,
  type LeachingRisk,
  type MoistureTrend,
  type NitrogenEstimate,
  type VegetationTrend,
  type YieldZones,
} from '../../../services/fieldHealthApi';
import { Info, InfoRow, LIGHT, LineChart, Section, SourceTag, TrafficLight, UnavailableNote } from './HealthUi';

export function FieldHealthTab({ fieldId, notify }: { fieldId: string; notify: (m: string) => void }) {
  const [data, setData] = useState<HealthTrend | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    (refresh = false) => {
      setLoading(true);
      setError(null);
      fieldHealthApi
        .getTrend(fieldId, refresh)
        .then(setData)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    },
    [fieldId]
  );

  useEffect(() => {
    setData(null);
    load(false);
  }, [load]);

  if (loading && !data) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-xs text-gray-500">
        <Loader2 size={20} className="animate-spin text-emerald-600" />
        Loading field health…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="space-y-3">
        <UnavailableNote data={{ reason: `Field health did not load (${error}).` }} />
        <button onClick={() => load(false)} className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => load(true)} className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-gray-700 hover:bg-gray-50">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <Actions actions={data.actions} />

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        <Vegetation v={data.vegetation_trend} />
        <Moisture m={data.moisture_trend} />
        <Zones z={data.yield_zones} geometry={data.card.geometry} />
        <Erosion e={data.erosion} />
        <Leaching l={data.leaching} />
        <Nitrogen n={data.card.nitrogen} fieldId={fieldId} onSaved={() => { notify('Saved.'); load(true); }} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ actions
function Actions({ actions }: { actions: HealthTrend['actions'] }) {
  const [all, setAll] = useState(false);
  if (!actions.length) {
    return (
      <Section title="What to do">
        <p className="flex items-center gap-1.5 text-xs text-gray-600">
          <Check size={14} className="text-emerald-600" /> Nothing needs action right now.
        </p>
      </Section>
    );
  }
  const shown = all ? actions : actions.slice(0, 4);
  return (
    <Section title="What to do">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {shown.map((a, i) => (
          <div key={i} className={`flex gap-2.5 rounded-xl border p-3 ${a.priority === 1 ? 'border-red-200 bg-red-50/50' : 'border-gray-200 bg-gray-50/60'}`}>
            {a.priority === 1 ? <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600" /> : <Lightbulb size={16} className="mt-0.5 shrink-0 text-amber-500" />}
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="text-xs font-extrabold text-gray-900">{a.title}</div>
                <Info label="Why this">
                  <div className="font-bold text-gray-900">Based on</div>
                  {a.evidence.map((e) => (
                    <div key={e}>• {e}</div>
                  ))}
                </Info>
              </div>
              <p className="mt-0.5 text-xs leading-snug text-gray-600">{a.body}</p>
            </div>
          </div>
        ))}
      </div>
      {actions.length > 4 && (
        <button onClick={() => setAll((v) => !v)} className="mt-2 text-xs font-semibold text-emerald-700 hover:underline">
          {all ? 'Show fewer' : `Show ${actions.length - 4} more`}
        </button>
      )}
    </Section>
  );
}

// ------------------------------------------------------------------ vegetation
function Vegetation({ v }: { v: VegetationTrend | { available: false; reason: string } }) {
  if (!v.available)
    return (
      <Section title="Vegetation, 3 years">
        <UnavailableNote data={v} />
      </Section>
    );
  const t = v.trend;
  const Icon = t.available ? (t.status === 'improving' ? ArrowUpRight : t.status === 'declining' ? ArrowDownRight : ArrowRight) : ArrowRight;
  const tone = t.available ? (t.status === 'improving' ? 'green' : t.status === 'declining' ? 'red' : 'yellow') : 'grey';
  const tonePill = t.available && t.status === 'stable' ? 'bg-slate-100 text-slate-700' : `${LIGHT[tone].bg} ${LIGHT[tone].text}`;
  return (
    <Section
      title="Vegetation, 3 years"
      right={
        <>
          {t.available && (
            <span className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold capitalize ${tonePill}`}>
              <Icon size={12} /> {t.status}
            </span>
          )}
          <Info label="About vegetation">
            <InfoRow k="Chart">Field-average NDVI of each cloud-free Sentinel-2 image ({v.observation_count} images, 10 m).</InfoRow>
            {t.available && <InfoRow k="Trend">Highest April–July value per year, straight-line fit. Under ±0.02 NDVI/year counts as stable (now {t.slope_per_year >= 0 ? '+' : ''}{t.slope_per_year.toFixed(3)}).</InfoRow>}
            <InfoRow k="Note">Different crops change NDVI. The trend covers field and crops together.</InfoRow>
          </Info>
        </>
      }
    >
      <LineChart yMin={0} yMax={1} series={[{ name: 'NDVI', colour: '#16a34a', points: v.series.map((s) => ({ x: s.date, y: s.mean_ndvi })) }]} />
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs text-gray-700">{t.available ? t.explanation : t.reason}</p>
        <div className="flex shrink-0 gap-1.5">
          {v.season_peaks.map((p) => (
            <span key={p.season} title={`${p.season} spring peak`} className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-600">
              {p.season} {p.peak_ndvi.toFixed(2)}
            </span>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ moisture
function Moisture({ m }: { m: MoistureTrend | { available: false; reason: string } }) {
  if (!m.available)
    return (
      <Section title="Soil moisture, 30 days">
        <UnavailableNote data={m} />
      </Section>
    );
  const used = m.measured.filter((x) => x.used);
  const last = m.modelled[m.modelled.length - 1];
  const u = m.usual_range;
  const below = u && last ? last.rootzone_m3m3 < u.p10 : false;
  const above = u && last ? last.rootzone_m3m3 > u.p90 : false;
  const top = Math.max(0.15, ...m.modelled.map((x) => x.rootzone_m3m3), ...(u ? [u.p90] : []), ...used.map((x) => x.value_m3m3)) * 1.15;
  const stress = m.events.find((e) => e.type === 'stress');
  return (
    <Section
      title="Soil moisture, 30 days"
      right={
        <>
          <SourceTag p="modelled" />
          <Info label="About soil moisture">
            <InfoRow k="Line">Root zone 0–100 cm, NASA SMAP L4 model (assimilates satellite readings), 9 km cell around the field.</InfoRow>
            {u && <InfoRow k="Green band">Usual range (10th–90th percentile) for this time of year, {u.years}, {u.window}.</InfoRow>}
            {used.length > 0 && <InfoRow k="Dots">Surface readings from NASA SMAP L3, quality-checked.</InfoRow>}
            {m.rejected_measurements ? <InfoRow k="Not drawn">{m.rejected_measurements} satellite readings without a quality pass.</InfoRow> : null}
          </Info>
        </>
      }
    >
      <LineChart
        yMin={0}
        yMax={top}
        decimals={2}
        band={u ? { from: u.p10, to: u.p90, colour: 'rgba(34,165,90,0.16)' } : undefined}
        series={[
          { name: 'Root zone', colour: '#7c3aed', points: m.modelled.map((x) => ({ x: x.date, y: x.rootzone_m3m3 })) },
          ...(used.length ? [{ name: 'Surface readings', colour: '#0f766e', style: 'dots' as const, points: used.map((x) => ({ x: x.date, y: x.value_m3m3 })) }] : []),
        ]}
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className={`text-xs font-semibold ${below ? 'text-red-700' : 'text-gray-700'}`}>
          {last
            ? below
              ? `Below the usual range (${u!.p10.toFixed(2)}–${u!.p90.toFixed(2)} m³/m³).`
              : above
                ? 'Above the usual range.'
                : 'Within the usual range.'
            : ''}
          {stress && !below ? ' Drier than usual.' : ''}
        </p>
        <div className="flex shrink-0 items-center gap-3 text-[10px] font-semibold text-gray-500">
          <span className="flex items-center gap-1">
            <span className="h-0.5 w-4 bg-violet-600" /> Root zone
          </span>
          {u && (
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-3 rounded-sm bg-emerald-500/30" /> Usual range
            </span>
          )}
        </div>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ yield zones
function FitBounds({ geometry }: { geometry: any }) {
  const map = useMap();
  useEffect(() => {
    if (geometry) map.fitBounds(L.geoJSON(geometry).getBounds(), { padding: [20, 20] });
  }, [geometry, map]);
  return null;
}

const ZONE_COLOUR: Record<string, string> = { high: '#1a7a3e', medium: '#dba828', low: '#b03a2e' };
const ZONE_WORD: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low' };

function Zones({ z, geometry }: { z: YieldZones | { available: false; reason: string }; geometry: any }) {
  if (!z.available)
    return (
      <Section title="Yield zones">
        <UnavailableNote data={z} />
      </Section>
    );
  const stable = z.stability?.stable_percent ?? z.stability?.stable_area_percent ?? null;
  return (
    <Section
      title="Yield zones"
      right={
        <>
          <SourceTag p="derived" />
          <Info label="About yield zones">
            <InfoRow k="Based on">{z.seasons_used.length} seasons ({z.seasons_used.join(', ')}), {z.observations_used} Sentinel-2 images.</InfoRow>
            <InfoRow k="How">{z.method}</InfoRow>
            <InfoRow k="Note">{z.caveat}</InfoRow>
          </Info>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_190px]">
        <div className="relative isolate h-56 overflow-hidden rounded-xl border border-gray-200">
          <MapContainer center={[51.77, 14.28]} zoom={15} className="h-full w-full" zoomControl={false} attributionControl={false}>
            <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={19} />
            <ImageOverlay url={z.map_url} bounds={z.bounds} opacity={0.85} />
            <GeoJSON data={geometry} style={{ color: '#ffffff', weight: 2, fillOpacity: 0 }} />
            <FitBounds geometry={geometry} />
          </MapContainer>
        </div>
        <div className="flex flex-col justify-center gap-2">
          {z.zones.map((zone) => (
            <div key={zone.zone}>
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-bold text-gray-800">{ZONE_WORD[zone.zone]}</span>
                <span className="text-gray-500">
                  {zone.area_ha.toFixed(1)} ha · {zone.percent_of_field.toFixed(0)} %
                </span>
              </div>
              <div className="mt-0.5 h-2 rounded-full bg-gray-100">
                <div className="h-2 rounded-full" style={{ width: `${zone.percent_of_field}%`, background: ZONE_COLOUR[zone.zone] }} />
              </div>
            </div>
          ))}
          {stable != null && <div className="text-[11px] text-gray-500">{Number(stable).toFixed(0)} % stable across seasons</div>}
        </div>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ erosion
function Erosion({ e }: { e: ErosionRisk | { available: false; reason: string } }) {
  if (!e.available)
    return (
      <Section title="Erosion risk">
        <UnavailableNote data={e} />
      </Section>
    );
  const top = [...e.factors].filter((f) => (f.points ?? 0) > 0).slice(0, 3);
  return (
    <Section
      title="Erosion risk"
      right={
        <>
          <SourceTag p="derived" />
          <Info label="About erosion risk">
            {e.factors.map((f) => (
              <InfoRow key={f.factor} k={f.factor}>
                {f.value}
                {f.source ? ` (${f.source})` : ''}
              </InfoRow>
            ))}
            <p className="text-gray-500">{e.method}</p>
          </Info>
        </>
      }
    >
      <div className="flex items-center gap-4">
        <TrafficLight level={e.level} />
        <div className="space-y-2">
          <div className={`text-lg font-extrabold ${LIGHT[e.level].text}`}>
            {LIGHT[e.level].word} <span className="text-xs font-semibold text-gray-500">· {e.dominant} erosion</span>
          </div>
          {top.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {top.map((f) => (
                <span key={f.factor} className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-700">
                  {f.factor}: {f.value.split(',')[0]}
                </span>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-700">{e.recommendation}</p>
        </div>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ leaching
function Leaching({ l }: { l: LeachingRisk | { available: false; reason: string } }) {
  if (!l.available)
    return (
      <Section title="Leaching risk">
        <UnavailableNote data={l} />
      </Section>
    );
  const sw: any = l.seeding_window;
  const alerts = l.alerts.filter((a) => a.level !== 'info');
  return (
    <Section
      title="Leaching risk"
      right={
        <>
          <SourceTag p="derived" />
          <Info label="About leaching risk">
            {l.factors.map((f) => (
              <InfoRow key={f.factor} k={f.factor}>
                {f.value}
                {f.source ? ` (${f.source})` : ''}
              </InfoRow>
            ))}
            <p className="text-gray-500">{l.method}</p>
            {sw.available && <p className="text-gray-500">Sowing window: {sw.rule}</p>}
          </Info>
        </>
      }
    >
      <div className="flex items-center gap-4">
        <TrafficLight level={l.level} />
        <div className="min-w-0 space-y-2">
          <div className={`text-lg font-extrabold ${LIGHT[l.level].text}`}>
            {LIGHT[l.level].word} <span className="text-xs font-semibold text-gray-500">· {l.vulnerability} soil vulnerability</span>
          </div>
          {alerts.map((a, i) => (
            <div key={i} className={`rounded-lg px-2 py-1 text-xs font-semibold ${a.level === 'red' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900'}`}>
              {a.text}
            </div>
          ))}
          <div className="flex items-start gap-1.5 text-xs text-gray-700">
            <Sprout size={14} className={`mt-0.5 shrink-0 ${sw.available && sw.status === 'open' ? 'text-emerald-600' : 'text-gray-400'}`} />
            <span>{sw.available ? sw.text : sw.reason}</span>
          </div>
        </div>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ nitrogen
function Nitrogen({ n, fieldId, onSaved }: { n: NitrogenEstimate; fieldId: string; onSaved: () => void }) {
  const [form, setForm] = useState<Partial<FarmerInputs>>(n.inputs);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setForm(n.inputs), [n.inputs]);

  const num = (k: keyof FarmerInputs) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value === '' ? null : Number(e.target.value) }));
  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      await fieldHealthApi.saveInputs(fieldId, form);
      onSaved();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };
  const box = 'mt-0.5 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-900';
  const lab = 'text-[11px] font-bold text-gray-600';

  const formEl = (
    <div className="mt-2 grid grid-cols-2 gap-2">
      <label className={lab}>
        Crop
        <select className={box} value={form.crop ?? ''} onChange={(e) => setForm((f) => ({ ...f, crop: e.target.value || null }))}>
          <option value="">Select</option>
          {Object.entries(n.options.crops).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </label>
      <label className={lab}>
        Yield target (dt/ha)
        <input type="number" min={0} className={box} value={form.yield_target ?? ''} onChange={num('yield_target')} />
      </label>
      <label className={lab}>
        Previous crop
        <select className={box} value={form.previous_crop ?? ''} onChange={(e) => setForm((f) => ({ ...f, previous_crop: e.target.value || null }))}>
          <option value="">Select</option>
          {Object.entries(n.options.previous_crops).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </label>
      <label className={lab}>
        Nmin 0–90 cm (kg N/ha)
        <input type="number" min={0} className={box} value={form.nmin_kg_ha ?? ''} onChange={num('nmin_kg_ha')} />
      </label>
      <label className={lab}>
        Organic N last year (kg/ha)
        <input type="number" min={0} className={box} value={form.organic_n_last_year_kg_ha ?? ''} onChange={num('organic_n_last_year_kg_ha')} />
      </label>
      <label className={lab}>
        N applied so far (kg/ha)
        <input type="number" min={0} className={box} value={form.last_n_application_kg_ha ?? ''} onChange={num('last_n_application_kg_ha')} />
      </label>
      <label className={lab}>
        Last N date
        <input type="date" className={box} value={form.last_n_application_date ?? ''} onChange={(e) => setForm((f) => ({ ...f, last_n_application_date: e.target.value || null }))} />
      </label>
      <div className="flex items-end">
        <button onClick={save} disabled={saving} className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {err && <p className="col-span-2 text-xs font-semibold text-red-700">{err}</p>}
    </div>
  );

  return (
    <Section
      title="Nitrogen this season"
      right={
        <>
          <SourceTag p={n.available ? 'derived' : 'farmer_input'} />
          <Info label="About nitrogen">
            <p>Estimate following the DüV calculation steps from your inputs. It is not the legal limit. Use your official Düngebedarfsermittlung (e.g. BESyD).</p>
            <p>Red-zone status is not known here. In a red zone, reduce the requirement by 20 %.</p>
          </Info>
        </>
      }
    >
      {n.available ? (
        <>
          <div className="flex items-end justify-between">
            <div>
              <div className="text-3xl font-extrabold text-gray-900">
                {n.estimate_kg_n_ha}
                <span className="ml-1 text-sm font-bold text-gray-400">kg N/ha</span>
              </div>
              <div className="text-xs text-gray-500">estimated need{n.remaining_kg_n_ha != null ? ` · ${n.remaining_kg_n_ha} left after ${n.applied_kg_n_ha} applied` : ''}</div>
            </div>
          </div>
          <details className="mt-3 rounded-xl border border-gray-100 p-2.5">
            <summary className="cursor-pointer text-xs font-bold text-gray-700">Breakdown and inputs</summary>
            <table className="mt-2 w-full text-xs">
              <tbody>
                {n.lines?.map((x) => (
                  <tr key={x.label} className="border-t border-gray-100">
                    <td className="py-1 text-gray-600">{x.label}</td>
                    <td className="py-1 text-right font-bold text-gray-900">{x.kg_n_ha > 0 ? '+' : ''}{x.kg_n_ha}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {formEl}
          </details>
        </>
      ) : (
        <>
          <p className="text-xs text-gray-600">Enter crop, yield target and Nmin to get your estimate.</p>
          {formEl}
        </>
      )}
    </Section>
  );
}
