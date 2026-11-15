import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Info as InfoIcon, Loader2 } from 'lucide-react';
import type { Provenance, Unavailable } from '../../../services/fieldHealthApi';

/** Short, plain source word shown quietly next to a value. Details live in the ⓘ popover. */
const SOURCE_WORD: Record<Provenance, string> = {
  measured: 'Satellite',
  observed: 'Satellite',
  satellite_estimate: 'Satellite est.',
  modelled: 'Model',
  derived: 'Calculated',
  farmer_input: 'Your input',
  unavailable: '',
};

export function SourceTag({ p }: { p?: Provenance | string | null }) {
  const word = SOURCE_WORD[(p as Provenance) || 'unavailable'];
  return word ? <span className="text-[10px] font-semibold text-gray-400">{word}</span> : null;
}

/** Small ⓘ button that opens a popover with source, method and caveats. */
export function Info({ children, label = 'Details', align = 'right' }: { children: React.ReactNode; label?: string; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <span ref={ref} className="relative inline-flex">
      <button type="button" aria-label={label} aria-expanded={open} onClick={() => setOpen((o) => !o)} className="rounded-full p-0.5 text-gray-400 hover:text-gray-700">
        <InfoIcon size={14} />
      </button>
      {open && (
        <div
          role="dialog"
          className={`absolute top-6 z-[600] w-72 space-y-1.5 rounded-xl border border-gray-200 bg-white p-3 text-[11px] leading-snug text-gray-700 shadow-xl ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {children}
        </div>
      )}
    </span>
  );
}

export function InfoRow({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="font-bold text-gray-900">{k}: </span>
      {children}
    </div>
  );
}

export const LIGHT: Record<string, { dot: string; text: string; bg: string; fill: string; word: string }> = {
  green: { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', fill: '#22a55a', word: 'Low' },
  yellow: { dot: 'bg-amber-400', text: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', fill: '#f2b33d', word: 'Moderate' },
  red: { dot: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50 border-red-200', fill: '#d6453d', word: 'High' },
  grey: { dot: 'bg-slate-300', text: 'text-slate-500', bg: 'bg-slate-50 border-slate-200', fill: '#9aa5b1', word: 'Unknown' },
};

export function TrafficLight({ level }: { level?: string | null }) {
  return (
    <div className="flex shrink-0 flex-col gap-1 rounded-full bg-slate-800 p-1.5" aria-label={`Risk ${level ?? 'unknown'}`}>
      {['red', 'yellow', 'green'].map((c) => (
        <span key={c} className={`h-3 w-3 rounded-full ${level === c ? LIGHT[c].dot : 'bg-slate-600'}`} />
      ))}
    </div>
  );
}

export function UnavailableNote({ data, compact = false }: { data: Unavailable | { reason?: string | null; pending_task?: string | null }; compact?: boolean }) {
  const pending = !!data.pending_task;
  return (
    <div className={`flex items-start gap-2 rounded-xl bg-slate-50 text-slate-500 ${compact ? 'px-2 py-1.5 text-[11px]' : 'px-3 py-2.5 text-xs'}`}>
      {pending ? <Loader2 size={13} className="mt-0.5 shrink-0 animate-spin text-sky-600" /> : <AlertCircle size={13} className="mt-0.5 shrink-0 text-slate-400" />}
      <span>{data.reason || 'Not available.'}</span>
    </div>
  );
}

export function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-black/[0.05] bg-white p-4 shadow-xs">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-extrabold text-gray-900">{title}</h3>
        <div className="flex items-center gap-1.5">{right}</div>
      </div>
      {children}
    </section>
  );
}

/** Minimal SVG line chart: lines, dots and an optional shaded "usual range" band. */
export function LineChart({
  series,
  height = 150,
  yMin,
  yMax,
  band,
  decimals = 2,
}: {
  series: { name: string; colour: string; points: { x: string; y: number | null }[]; style?: 'line' | 'dots'; dashed?: boolean }[];
  height?: number;
  yMin?: number;
  yMax?: number;
  band?: { from: number; to: number; colour: string };
  decimals?: number;
}) {
  const W = 700;
  const pad = { l: 40, r: 8, t: 8, b: 20 };
  const xs = Array.from(new Set(series.flatMap((s) => s.points.map((p) => p.x)))).sort();
  const ys = series.flatMap((s) => s.points.map((p) => p.y)).filter((v): v is number => v !== null && Number.isFinite(v));
  if (xs.length === 0 || ys.length === 0) return <div className="text-xs text-gray-400">No data points.</div>;
  const t0 = new Date(xs[0]).getTime();
  const t1 = Math.max(t0 + 86400000, new Date(xs[xs.length - 1]).getTime());
  const lo = yMin ?? Math.min(...ys);
  const hi = yMax ?? Math.max(...ys);
  const span = hi - lo || 1;
  const X = (d: string) => pad.l + ((new Date(d).getTime() - t0) / (t1 - t0)) * (W - pad.l - pad.r);
  const Y = (v: number) => pad.t + (1 - (v - lo) / span) * (height - pad.t - pad.b);
  const ticks = [lo, hi];
  const month = (d: string) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: t1 - t0 > 200 * 86400000 ? '2-digit' : undefined });
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="h-auto w-full overflow-visible" role="img">
      {band && (
        <rect x={pad.l} width={W - pad.l - pad.r} y={Y(Math.min(hi, band.to))} height={Math.max(0, Y(Math.max(lo, band.from)) - Y(Math.min(hi, band.to)))} fill={band.colour} />
      )}
      {ticks.map((v, i) => (
        <g key={i}>
          <line x1={pad.l} x2={W - pad.r} y1={Y(v)} y2={Y(v)} stroke="#eef0f2" />
          <text x={pad.l - 5} y={Y(v) + 3} fontSize="10" textAnchor="end" fill="#94a3b8" fontWeight="600">
            {v.toFixed(decimals)}
          </text>
        </g>
      ))}
      {[xs[0], xs[xs.length - 1]].map((d, i) => (
        <text key={i} x={X(d)} y={height - 5} fontSize="10" textAnchor={i === 0 ? 'start' : 'end'} fill="#94a3b8" fontWeight="600">
          {month(d)}
        </text>
      ))}
      {series.map((s) => {
        const pts = s.points.filter((p) => p.y !== null && Number.isFinite(p.y as number)) as { x: string; y: number }[];
        if (s.style === 'dots') {
          return (
            <g key={s.name}>
              {pts.map((p, i) => (
                <circle key={i} cx={X(p.x)} cy={Y(p.y)} r={3} fill={s.colour} stroke="white" strokeWidth={1} />
              ))}
            </g>
          );
        }
        const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`).join(' ');
        return <path key={s.name} d={d} fill="none" stroke={s.colour} strokeWidth={2.2} strokeDasharray={s.dashed ? '5 4' : undefined} strokeLinejoin="round" />;
      })}
    </svg>
  );
}

export const COLOUR_HEX: Record<string, string> = {
  red: '#c82828',
  yellow: '#ebb428',
  green: '#3ca050',
  blue: '#286eb4',
};
