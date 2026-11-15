import { useI18n } from '../../i18n';
import type { Strategy } from './types';

export function ExplainBox({ strategy }: { strategy: Strategy }) {
  const { t } = useI18n();
  const e = strategy.explanation;
  return (
    <div className="cp-card cp-explain">
      <h3>{t('cropPlanner.explain.why')} · {t(`cropPlanner.strategies.${strategy.id}`)}</h3>
      {e.why.length === 0 && <p className="cp-sub">–</p>}
      <ul>
        {e.why.map((w) => (
          <li key={w.axis}>
            {w.statement}
            <div className="cp-src">{t('cropPlanner.explain.source')}: {w.source}{w.data_as_of ? ` · ${w.data_as_of}` : ''}</div>
          </li>
        ))}
      </ul>
      {e.weak_points.length > 0 && (
        <>
          <h4>{t('cropPlanner.explain.weak')}</h4>
          <ul>{e.weak_points.map((w) => <li key={w.axis}>{w.statement}</li>)}</ul>
        </>
      )}
      <details>
        <summary><strong>{t('cropPlanner.explain.limits')}</strong></summary>
        <ul>{e.limitations.map((l, i) => <li key={i}>{l.text}</li>)}</ul>
      </details>
      <div className="cp-notice warn">
        <strong>{t('cropPlanner.explain.caveats')}</strong>
        <ul>{e.caveats.map((c) => <li key={c}>{c}</li>)}</ul>
      </div>
    </div>
  );
}
