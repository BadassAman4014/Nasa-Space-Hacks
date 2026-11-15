import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { GeoJSON, ImageOverlay, MapContainer, TileLayer, ZoomControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import {
  fieldHealthApi,
  type FieldCard,
  type MapField,
  type OverlayResponse,
  type RasterLayer,
} from '../../../services/fieldHealthApi';
import { COLOUR_HEX, Info, InfoRow, LIGHT, SourceTag, UnavailableNote } from './HealthUi';

type OverlayKind = 'moisture' | 'nitrogen' | 'leaching';

const CHIPS: { kind: OverlayKind; label: string; hint: string }[] = [
  { kind: 'moisture', label: 'Moisture', hint: 'Water status inside the field' },
  { kind: 'nitrogen', label: 'Nitrogen', hint: 'Nitrogen uptake zones inside the field' },
  { kind: 'leaching', label: 'Leaching', hint: 'Nitrate leaching risk for the field' },
];

/** Short legend labels per raster kind (colour order as returned by the API). */
const SHORT_LEGEND: Record<string, { title: string; items: { colour: string; label: string }[] }> = {
  ndmi: { title: 'Plant water', items: [{ colour: 'red', label: 'Low' }, { colour: 'yellow', label: 'Medium' }, { colour: 'green', label: 'High' }] },
  ndre: { title: 'Nitrogen uptake', items: [{ colour: 'red', label: 'Low' }, { colour: 'yellow', label: 'Medium' }, { colour: 'green', label: 'High' }] },
  ecostress_esi: {
    title: 'Water stress',
    items: [{ colour: 'red', label: 'Stressed' }, { colour: 'yellow', label: 'Moderate' }, { colour: 'green', label: 'OK' }, { colour: 'blue', label: 'Wet' }],
  },
};

const MOISTURE_WORD: Record<string, { value: string; sub: string }> = {
  red: { value: 'Low', sub: 'Drier than usual' },
  yellow: { value: 'Medium', sub: 'Slightly dry' },
  green: { value: 'OK', sub: 'Normal or wetter' },
};

function FitTo({ bounds }: { bounds: L.LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
  }, [bounds, map]);
  return null;
}

const shortDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');

export function FieldMapTab({
  fieldId,
  onSelectField,
  onOpenHealth,
  onNavigate,
}: {
  fieldId: string;
  onSelectField?: (id: string) => void;
  onOpenHealth: () => void;
  onNavigate?: (page: string) => void;
}) {
  const [fields, setFields] = useState<MapField[] | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [card, setCard] = useState<FieldCard | null>(null);
  const [cardLoading, setCardLoading] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [active, setActive] = useState<Record<OverlayKind, boolean>>({ moisture: false, nitrogen: false, leaching: false });
  const [overlays, setOverlays] = useState<Partial<Record<OverlayKind, OverlayResponse | 'loading' | { error: string }>>>({});

  const loadMap = useCallback((refresh = false) => {
    setMapError(null);
    fieldHealthApi.getMap(refresh).then(setFields).catch((e) => setMapError(e.message));
  }, []);
  useEffect(() => loadMap(false), [loadMap]);

  useEffect(() => {
    setCard(null);
    setCardError(null);
    setOverlays({});
    setCardLoading(true);
    fieldHealthApi
      .getCard(fieldId)
      .then(setCard)
      .catch((e) => setCardError(e.message))
      .finally(() => setCardLoading(false));
  }, [fieldId]);

  const toggle = (kind: OverlayKind) => {
    const on = !active[kind];
    // One layer at a time keeps the map readable.
    setActive({ moisture: false, nitrogen: false, leaching: false, [kind]: on });
    if (on && !overlays[kind]) {
      setOverlays((o) => ({ ...o, [kind]: 'loading' }));
      fieldHealthApi
        .getOverlay(fieldId, kind)
        .then((r) => setOverlays((o) => ({ ...o, [kind]: r })))
        .catch((e) => setOverlays((o) => ({ ...o, [kind]: { error: e.message } })));
    }
  };

  const selected = fields?.find((f) => f.field_id === fieldId) ?? null;
  const selectedBounds = useMemo(() => (selected ? L.geoJSON(selected.geometry).getBounds() : null), [selected?.field_id, !!fields]);
  const resolved = (k: OverlayKind) => {
    const o = overlays[k];
    return o && o !== 'loading' && !('error' in (o as any)) ? (o as OverlayResponse) : null;
  };
  const leach = resolved('leaching');
  const rasterLayers: RasterLayer[] = (['moisture', 'nitrogen'] as OverlayKind[])
    .filter((k) => active[k])
    .map((k) => resolved(k))
    .filter((o): o is OverlayResponse => !!o && !!o.available && !!o.layer && (o.layer as any).available)
    .map((o) => o.layer as RasterLayer);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
      <div className="relative isolate h-[600px] overflow-hidden rounded-2xl border border-black/[0.06] bg-slate-200 shadow-xs">
        <MapContainer center={[51.77, 14.28]} zoom={13} className="h-full w-full" zoomControl={false}>
          <ZoomControl position="bottomright" />
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="Imagery © Esri, Maxar, Earthstar Geographics"
            maxZoom={19}
          />
          {fields?.map((f) => {
            const cls = f.moisture.available ? (f.moisture as any).class : 'grey';
            const isSel = f.field_id === fieldId;
            const leachFill = isSel && active.leaching && leach?.available && leach.level ? LIGHT[leach.level].fill : null;
            return (
              <GeoJSON
                key={`${f.field_id}-${cls}-${isSel}-${leachFill}`}
                data={f.geometry}
                style={{
                  color: isSel ? '#ffffff' : LIGHT[cls].fill,
                  weight: isSel ? 3 : 2,
                  fillColor: leachFill || LIGHT[cls].fill,
                  fillOpacity: rasterLayers.length && isSel ? 0 : leachFill ? 0.6 : 0.5,
                }}
                eventHandlers={{ click: () => onSelectField?.(f.field_id) }}
              />
            );
          })}
          {rasterLayers.map((l) => (
            <ImageOverlay key={l.kind} url={l.png} bounds={l.bounds} opacity={0.9} zIndex={400} />
          ))}
          <FitTo bounds={selectedBounds} />
        </MapContainer>

        {/* Overlay chips */}
        <div className="absolute left-3 top-3 z-[500] flex items-center gap-1.5">
          {CHIPS.map((c) => {
            const on = active[c.kind];
            return (
              <button
                key={c.kind}
                onClick={() => toggle(c.kind)}
                title={c.hint}
                aria-pressed={on}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold shadow-md backdrop-blur transition ${
                  on ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-white/60 bg-white/90 text-gray-700 hover:bg-white'
                }`}
              >
                {overlays[c.kind] === 'loading' && <Loader2 size={12} className="animate-spin" />}
                {c.label}
              </button>
            );
          })}
          <button onClick={() => loadMap(true)} title="Reload" className="rounded-full bg-white/90 p-1.5 text-gray-600 shadow-md hover:bg-white">
            <RefreshCw size={13} />
          </button>
        </div>
        {!fields && !mapError && (
          <div className="absolute right-3 top-3 z-[500] flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-gray-600 shadow-md">
            <Loader2 size={12} className="animate-spin text-emerald-600" /> Loading fields
          </div>
        )}
        {mapError && (
          <div className="absolute left-3 top-14 z-[500] max-w-xs">
            <UnavailableNote compact data={{ reason: `Map data did not load (${mapError}).` }} />
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-3 left-3 z-[500] max-w-[300px] space-y-2 rounded-xl bg-white/95 p-2.5 text-[11px] shadow-lg backdrop-blur">
          {(['moisture', 'nitrogen', 'leaching'] as OverlayKind[]).filter((k) => active[k]).map((k) => (
            <OverlayLegend key={k} kind={k} state={overlays[k]} />
          ))}
          <div className="flex items-center gap-2.5 text-gray-600">
            <span className="font-bold text-gray-800">Field colour</span>
            {(['green', 'yellow', 'red'] as const).map((c) => (
              <span key={c} className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: LIGHT[c].fill }} />
                {c === 'green' ? 'Moist' : c === 'yellow' ? 'Medium' : 'Dry'}
              </span>
            ))}
            <Info label="About field colour" align="left">
              <InfoRow k="Field colour">Soil moisture of the root zone (0–100 cm) compared with the same time of year in 2016–2025.</InfoRow>
              <InfoRow k="Source">NASA SMAP L4 model, 9 km cells.</InfoRow>
            </Info>
          </div>
        </div>
      </div>

      <aside>
        {cardLoading && (
          <div className="flex h-40 items-center justify-center rounded-2xl border border-black/[0.05] bg-white text-xs text-gray-500">
            <Loader2 size={15} className="mr-2 animate-spin text-emerald-600" /> Loading
          </div>
        )}
        {cardError && <UnavailableNote data={{ reason: `Field data did not load (${cardError}).` }} />}
        {card && <FieldCardView card={card} onOpenHealth={onOpenHealth} onNavigate={onNavigate} />}
      </aside>
    </div>
  );
}

function OverlayLegend({ kind, state }: { kind: OverlayKind; state: OverlayResponse | 'loading' | { error: string } | undefined }) {
  if (!state || state === 'loading') return <div className="text-gray-500">Loading…</div>;
  if ('error' in (state as any)) return <div className="text-gray-500">Not available right now.</div>;
  const o = state as OverlayResponse;
  if (kind === 'leaching') {
    if (!o.available) return <div className="text-gray-500">{o.reason || 'Not available.'}</div>;
    return (
      <div className="flex items-center gap-2">
        <span className="font-bold text-gray-800">Leaching</span>
        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: LIGHT[o.level || 'grey'].fill }} />
        <span className={`font-bold ${LIGHT[o.level || 'grey'].text}`}>{LIGHT[o.level || 'grey'].word}</span>
        <Info label="About leaching" align="left">
          <InfoRow k="Whole field">{o.note}</InfoRow>
          <InfoRow k="Soil">{o.vulnerability} vulnerability to nitrate loss.</InfoRow>
        </Info>
      </div>
    );
  }
  const layer = o.layer as RasterLayer | { available: false; reason: string } | undefined;
  if (!o.available || !layer || !(layer as any).available) {
    return <div className="text-gray-500">{o.reason || (layer as any)?.reason || 'Not available.'}</div>;
  }
  const l = layer as RasterLayer;
  const short = SHORT_LEGEND[l.kind];
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5">
        <span className="font-bold text-gray-800">{short?.title || l.title}</span>
        <span className="text-gray-400">{shortDate(l.date)}</span>
        <SourceTag p={l.provenance} />
        <Info label="About this layer" align="left">
          <InfoRow k="What">{l.title}</InfoRow>
          {l.legend.map((it) => (
            <div key={it.label} className="flex items-start gap-1.5">
              <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: COLOUR_HEX[it.colour] || it.colour }} />
              {it.label}
            </div>
          ))}
          {l.note && <p className="italic text-gray-500">{l.note}</p>}
        </Info>
      </div>
      <div className="flex gap-3">
        {(short?.items || l.legend.map((i) => ({ colour: i.colour, label: i.label }))).map((it) => (
          <span key={it.label} className="flex items-center gap-1 text-gray-600">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLOUR_HEX[it.colour] || it.colour }} />
            {it.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function Tile({ label, children, sub, tag, info }: { label: string; children: React.ReactNode; sub?: React.ReactNode; tag?: string; info?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-bold text-gray-500">{label}</span>
        {info && <Info label={`About ${label}`}>{info}</Info>}
      </div>
      <div className="text-xl font-extrabold leading-tight text-gray-900">{children}</div>
      {sub && <div className="mt-0.5 text-[11px] text-gray-500">{sub}</div>}
      {tag && <div className="mt-1">
        <SourceTag p={tag} />
      </div>}
    </div>
  );
}

const unit = (t: string) => <span className="ml-1 text-xs font-bold text-gray-400">{t}</span>;

function FieldCardView({ card, onOpenHealth, onNavigate }: { card: FieldCard; onOpenHealth: () => void; onNavigate?: (page: string) => void }) {
  const m: any = card.moisture;
  const r: any = card.rain;
  const s: any = card.soil_health;
  const n = card.nitrogen;
  const w: any = card.weather;
  const dwd = w.available && w.alerts?.available ? w.alerts.alerts : [];

  return (
    <div className="space-y-3 rounded-2xl border border-black/[0.05] bg-white p-4 shadow-xs">
      <div>
        <h3 className="text-base font-extrabold text-gray-900">{card.name}</h3>
        <p className="text-xs text-gray-500">
          {card.area_ha} ha · {card.crop || 'No crop assigned'}
        </p>
      </div>

      {dwd.length > 0 && (
        <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-900">
          <AlertTriangle size={13} className="shrink-0" />
          DWD: {dwd.map((a: any) => a.label).join(', ')}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Tile
          label="Soil moisture"
          tag={m.available ? 'modelled' : undefined}
          sub={m.available ? MOISTURE_WORD[m.class].sub : <span title={m.reason}>{m.reason}</span>}
          info={
            m.available && (
              <>
                <InfoRow k="Now">{m.rootzone_m3m3} m³/m³ in the root zone (0–100 cm). Usual for this time of year: {m.climatology_median_m3m3}.</InfoRow>
                <InfoRow k="Compared with">
                  {m.climatology_samples} days around {shortDate(m.date)} in {m.climatology_years}.
                </InfoRow>
                <InfoRow k="Source">NASA SMAP L4 model, 9 km cell around the field. Data to {shortDate(m.date)}.</InfoRow>
              </>
            )
          }
        >
          {m.available ? (
            <span className="flex items-center gap-1.5">
              <span className={`h-3 w-3 rounded-full ${LIGHT[m.class].dot}`} />
              {MOISTURE_WORD[m.class].value}
            </span>
          ) : (
            '—'
          )}
        </Tile>

        <Tile
          label="Last rain"
          tag={r.available ? 'satellite_estimate' : undefined}
          sub={r.available ? `${r.rain_7d_mm} mm in 7 days` : r.reason}
          info={
            r.available && (
              <>
                <InfoRow k="Counts">Days since a day with at least 1 mm.</InfoRow>
                <InfoRow k="Last 30 days">{r.rain_30d_mm} mm. Last 12 months: {r.rain_365d_mm} mm.</InfoRow>
                <InfoRow k="Source">NASA GPM IMERG satellite estimate, ~11 km cell, data to {shortDate(r.as_of)}. Not gauge-corrected.</InfoRow>
              </>
            )
          }
        >
          {r.available ? (
            <>
              {r.days_since_rain === null ? '> 1 yr' : r.days_since_rain}
              {r.days_since_rain !== null && unit('days')}
            </>
          ) : (
            '—'
          )}
        </Tile>

        <Tile
          label="Soil health"
          tag={s.available ? 'derived' : undefined}
          sub={s.available ? `${s.label[0].toUpperCase()}${s.label.slice(1)} · weakest: ${s.weakest.replace(/ \(.*\)/, '').toLowerCase()}` : s.reason}
          info={
            s.available && (
              <>
                {s.components.map((c: any) => (
                  <InfoRow key={c.name} k={c.name}>
                    {c.value} {c.unit} → {Math.round(c.score)}/100
                  </InfoRow>
                ))}
                <InfoRow k="Source">ISRIC SoilGrids, 0–30 cm, 250 m. A FieldShift score, not an official index.</InfoRow>
              </>
            )
          }
        >
          {s.available ? (
            <>
              {s.score}
              {unit('/ 100')}
            </>
          ) : (
            '—'
          )}
        </Tile>

        <Tile
          label="Nitrogen"
          tag={n.available ? 'derived' : undefined}
          sub={
            n.available ? (
              n.remaining_kg_n_ha != null ? 'left this season' : 'estimated need'
            ) : (
              <button onClick={onOpenHealth} className="font-semibold text-emerald-700 underline">
                Add crop and Nmin
              </button>
            )
          }
          info={
            <>
              <p>Estimate following the DüV calculation steps from your inputs. Not the legal limit: check your official Düngebedarfsermittlung.</p>
              {n.available && n.lines?.map((l) => (
                <InfoRow key={l.label} k={l.label}>
                  {l.kg_n_ha > 0 ? '+' : ''}
                  {l.kg_n_ha} kg
                </InfoRow>
              ))}
            </>
          }
        >
          {n.available ? (
            <>
              {n.remaining_kg_n_ha ?? n.estimate_kg_n_ha}
              {unit('kg N/ha')}
            </>
          ) : (
            '—'
          )}
        </Tile>
      </div>

      <div className="rounded-xl bg-gray-50 p-3">
        {w.available ? (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-extrabold text-gray-900">{Math.round(w.current.temperature_c)}°C</span>
                <span className="text-xs text-gray-500">
                  {w.current.condition} · {w.current.wind_speed_ms} m/s
                </span>
              </div>
              <Info label="About weather">
                <InfoRow k="Source">Open-Meteo forecast model for the field centre. Warnings from the German Weather Service (DWD).</InfoRow>
              </Info>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {w.forecast_3d.map((d: any) => (
                <div key={d.date} className="rounded-lg bg-white px-2 py-1.5 text-center">
                  <div className="text-[10px] font-bold text-gray-500">{d.day_name}</div>
                  <div className="text-xs font-extrabold text-gray-900">
                    {Math.round(d.temp_min_c)}° / {Math.round(d.temp_max_c)}°
                  </div>
                  <div className="text-[10px] font-semibold text-sky-700">{d.precipitation_mm} mm</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-gray-500">{w.reason}</p>
        )}
      </div>

      <button onClick={onOpenHealth} className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700">
        Field health
      </button>
      <div className="flex justify-center gap-5 text-xs font-semibold text-gray-600">
        <button onClick={() => onNavigate?.('rotation-studio')} disabled={!onNavigate} className="hover:text-emerald-700 hover:underline disabled:opacity-40">
          Crop planner
        </button>
        <button onClick={() => onNavigate?.('reports')} disabled={!onNavigate} className="hover:text-emerald-700 hover:underline disabled:opacity-40">
          Documentation
        </button>
      </div>
    </div>
  );
}
