import { useI18n } from '../../i18n';
import { ExplainBox } from './ExplainBox';
import type { AxisKey, Recommendation, Strategy } from './types';

const AXES: AxisKey[] = ['water', 'soil_cover', 'nitrogen', 'heat'];

function gloezChip(s: Strategy, t: (k: string) => string) {
  const st = s.legal.gloez7.status;
  if (st === 'compliant') return <span className="cp-chip ok" title={s.legal.gloez7.rule.source_name}>{t('cropPlanner.strategies.gloezOk')}</span>;
  if (st === 'violation') return <span className="cp-chip bad" title={s.legal.gloez7.violations[0]?.reason ?? ''}>{t('cropPlanner.strategies.gloezViolation')}</span>;
  return <span className="cp-chip warn">{t('cropPlanner.strategies.gloezUnknown')}</span>;
}

export function RotationStrategiesTab({ rec, selected, onSelect }: { rec: Recommendation; selected: string; onSelect: (id: string) => void }) {
  const { t, language } = useI18n();
  const sel = rec.strategies.find((s) => s.id === selected) ?? rec.strategies[0];
  const histYears = rec.history;

  return (
    <>
      <section className="cp-card">
        <div>
          <h2>{t('cropPlanner.strategies.title')}</h2>
          <p className="cp-sub">{rec.confidence_note} {t('cropPlanner.strategies.noIncome')}</p>
        </div>
        {rec.alternatives_note && <div className="cp-notice warn">{rec.alternatives_note}</div>}
        {rec.excluded_axes.length > 0 && (
          <div className="cp-notice warn">{t('cropPlanner.strategies.excludedAxes', { axes: rec.excluded_axes.map((a) => t(`cropPlanner.strategies.axes.${a}`)).join(', ') })}</div>
        )}
        <div className="cp-grid">
          <table>
            <thead>
              <tr>
                <th />
                {histYears.map((h) => <th key={h.year}>{h.year} · {t('cropPlanner.strategies.actual')}</th>)}
                {rec.years.map((y) => <th key={y} className="plan">{y} · {t('cropPlanner.strategies.plan')}</th>)}
              </tr>
            </thead>
            <tbody>
              {rec.strategies.map((s) => (
                <tr key={s.id}>
                  <td className="cp-rowhead">
                    <strong>{s.id} · {t(`cropPlanner.strategies.${s.id}`)}</strong>
                    {gloezChip(s, t)}
                    {s.years.some((y) => y.cap.field.grain_legume) && <span className="cp-chip ok">{t('cropPlanner.strategies.eco')}: legume</span>}
                  </td>
                  {histYears.map((h) => <td key={h.year} className="cp-cell actual">{language === 'de' ? h.crop_label_de : h.crop_label}</td>)}
                  {s.years.map((y) => (
                    <td key={y.year} className={`cp-cell ${y.feasibility_from_previous && !y.feasibility_from_previous.ok ? 'bad' : ''}`}>
                      {language === 'de' ? y.crop_label_de : y.crop_label}
                      {y.catch_crop_after && <small>{t('cropPlanner.strategies.catchCrop')}</small>}
                      {!y.scored && <small>{t('cropPlanner.strategies.notScored')}</small>}
                      {y.feasibility_from_previous && !y.feasibility_from_previous.ok && <small title={y.feasibility_from_previous.reason ?? ''}>{t('cropPlanner.strategies.infeasible')}</small>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="cp-card">
        <div>
          <h2>{t('cropPlanner.strategies.matrix')}</h2>
          <p className="cp-sub">{t('cropPlanner.strategies.overallNote')}</p>
        </div>
        <table className="cp-matrix">
          <thead>
            <tr>
              <th />
              {AXES.map((a) => <th key={a}>{t(`cropPlanner.strategies.axes.${a}`)}</th>)}
              <th>{t('cropPlanner.strategies.overall')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rec.strategies.map((s) => (
              <tr key={s.id} className={`cp-pick ${s.id === sel.id ? 'on' : ''}`} onClick={() => onSelect(s.id)}>
                <td><strong>{s.id}</strong> {t(`cropPlanner.strategies.${s.id}`)}</td>
                {AXES.map((a) => {
                  const ax = s.axes[a];
                  return (
                    <td key={a}>
                      {ax.score === null ? (
                        <span className="cp-ns" title={ax.reason ?? ''}>{t('cropPlanner.strategies.notScored')}</span>
                      ) : (
                        <>
                          <strong>{Math.round(ax.score)}</strong>{ax.status === 'partial' && <span className="cp-ns" title={ax.reason ?? ''}> *</span>}
                          <div className="cp-bar"><i style={{ width: `${ax.score}%` }} /></div>
                        </>
                      )}
                    </td>
                  );
                })}
                <td><strong>{s.overall === null ? '–' : Math.round(s.overall)}</strong></td>
                <td>{s.id === sel.id ? <span className="cp-chip ok">{t('cropPlanner.strategies.selected')}</span> : <span className="cp-chip">{t('cropPlanner.strategies.select')}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rec.excluded_crops.length > 0 && (
          <p className="cp-src">{t('cropPlanner.strategies.excludedCrops', { crops: rec.excluded_crops.map((c) => `${c.id} (${c.missing.join(', ')})`).join('; ') })}</p>
        )}
      </section>

      <ExplainBox strategy={sel} />
    </>
  );
}
