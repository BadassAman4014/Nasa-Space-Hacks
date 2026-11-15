import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useI18n } from '../../i18n';
import type {
  FieldRiskItem,
  FieldRiskResponse,
  RiskLevel,
  RiskProvenance,
} from '../../services/fieldAnalyticsApi';

const LEVEL_STYLE: Record<RiskLevel, string> = {
  green: 'border-emerald-200 bg-emerald-50/60 text-emerald-900',
  yellow: 'border-amber-200 bg-amber-50/60 text-amber-900',
  red: 'border-red-200 bg-red-50/60 text-red-900',
  info: 'border-blue-200 bg-blue-50/60 text-blue-900',
  unavailable: 'border-gray-200 bg-gray-50 text-gray-700',
};

function Provenance({ value, asOf }: { value?: RiskProvenance; asOf?: string | null }) {
  const { t, formatDate } = useI18n();
  if (!value) return asOf ? <span>{formatDate(asOf)}</span> : null;
  return (
    <span className="rounded-full border border-black/10 bg-white/80 px-2 py-0.5 text-[10px] font-bold">
      {t(`cropPlanner.provenance.${value}`)}
      {asOf && value !== 'unavailable' ? ` · ${formatDate(asOf)}` : ''}
    </span>
  );
}

function RiskTile({ item }: { item: FieldRiskItem }) {
  const { t } = useI18n();
  return (
    <article className={`rounded-2xl border p-4 ${LEVEL_STYLE[item.level]}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <strong className="text-sm">{item.label}</strong>
        <span className="rounded-full bg-white/75 px-2 py-0.5 text-[10px] font-black uppercase">
          {t(`cropPlanner.risk.level.${item.level}`)}
        </span>
      </div>
      <p className="mt-2 text-sm font-semibold leading-snug">{item.reading}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] opacity-75">
        {item.source_used && <span>{item.source_used}</span>}
        {item.as_of && <span>{new Date(item.as_of).toLocaleDateString()}</span>}
      </div>
      {(item.factors?.length || item.method) && (
        <details className="mt-3 rounded-xl bg-white/65 px-3 py-2">
          <summary className="cursor-pointer text-xs font-bold">{t('cropPlanner.risk.method')}</summary>
          {item.factors && item.factors.length > 0 && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-[11px]">
                <tbody>
                  {item.factors.map((factor) => (
                    <tr key={factor.factor} className="border-t border-black/5 first:border-0">
                      <th className="py-1.5 pr-3">{factor.factor}</th>
                      <td className="py-1.5 pr-3">{factor.value}{factor.reason ? ` (${factor.reason})` : ''}</td>
                      <td className="py-1.5 pr-3">{factor.points === null ? '–' : `${factor.points} pt`}</td>
                      <td className="py-1.5"><Provenance value={factor.provenance} asOf={factor.as_of} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {item.method && <p className="mt-2 text-[11px] leading-relaxed opacity-75">{item.method}</p>}
        </details>
      )}
      {item.sources && item.sources.length > 0 && (
        <p className="mt-2 text-[10px] opacity-70">{t('cropPlanner.risk.source')}: {item.sources.join('; ')}</p>
      )}
    </article>
  );
}

export function FieldRiskTab({
  data,
  loading,
  error,
  onRefresh,
}: {
  data: FieldRiskResponse | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  return (
    <section className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-black/[0.06] bg-white p-5 shadow-xs">
        <div>
          <h2 className="text-lg font-extrabold text-gray-900">{t('cropPlanner.risk.title')}</h2>
          <p className="mt-1 text-xs text-gray-500">{t('cropPlanner.risk.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}
      {loading && !data && <div className="rounded-2xl bg-white p-5 text-sm text-gray-500">Loading field risk…</div>}
      {data && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {data.items.map((item) => <RiskTile key={item.id} item={item} />)}
          </div>
          {(data.soil_texture.farmer || data.soil_texture.satellite) && (
            <div className="rounded-2xl border border-black/[0.06] bg-white p-4 text-sm text-gray-700">
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {data.soil_texture.farmer && (
                  <span>{t('cropPlanner.risk.soilFarmer')}: <strong>{data.soil_texture.farmer}</strong></span>
                )}
                {data.soil_texture.satellite && (
                  <span>{t('cropPlanner.risk.soilSatellite')}: <strong>{data.soil_texture.satellite}</strong></span>
                )}
              </div>
              {data.soil_texture.check?.note && (
                <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">{data.soil_texture.check.note}</p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
