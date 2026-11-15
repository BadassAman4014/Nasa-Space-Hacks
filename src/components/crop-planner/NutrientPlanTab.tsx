import { useI18n } from '../../i18n';
import type { Strategy } from './types';

const fmt = (v: number | null) => (v === null ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}`);

export function NutrientPlanTab({ strategy }: { strategy: Strategy }) {
  const { t, language } = useI18n();
  return (
    <section className="cp-card">
      <div>
        <h2>{t('cropPlanner.nutrient.title')} · {strategy.id} {t(`cropPlanner.strategies.${strategy.id}`)}</h2>
        <p className="cp-sub">{t('cropPlanner.nutrient.subtitle')}</p>
      </div>
      {strategy.years.map((y) => {
        const d = y.dbe;
        return (
          <div key={y.year} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h3>{y.year} · {language === 'de' ? y.crop_label_de : y.crop_label}</h3>
            {!d.available ? (
              <p className="cp-sub">{d.reason ?? t('cropPlanner.nutrient.noValue')}</p>
            ) : (
              <table className="cp-dbe">
                <tbody>
                  {d.lines.map((l) => (
                    <tr key={l.label} className={l.applied ? '' : 'off'}>
                      <td>{l.label}{l.note && <div className="cp-src">{l.note}</div>}</td>
                      <td className="num">{l.applied ? `${fmt(l.kg_n_ha)} kg N/ha` : t('cropPlanner.nutrient.notApplied')}</td>
                      <td className="cp-src">{l.ref}</td>
                    </tr>
                  ))}
                  <tr className="total">
                    <td>{t('cropPlanner.nutrient.before')}</td>
                    <td className="num">{d.requirement_before_nmin_kg_n_ha} kg N/ha</td>
                    <td />
                  </tr>
                  <tr className="total">
                    <td>{t('cropPlanner.nutrient.legal')}</td>
                    <td className="num">{d.legal_max_kg_n_ha === null ? '–' : `${d.legal_max_kg_n_ha} kg N/ha`}</td>
                    <td className="cp-src">{d.legal_max_kg_n_ha === null ? t('cropPlanner.nutrient.needNmin') : ''}</td>
                  </tr>
                </tbody>
              </table>
            )}
            {d.credit_to_next_crop_kg_n_ha !== null && d.credit_to_next_crop_kg_n_ha > 0 && (
              <span className="cp-chip ok">{t('cropPlanner.nutrient.credit', { kg: d.credit_to_next_crop_kg_n_ha })}</span>
            )}
          </div>
        );
      })}
      {strategy.years[0]?.dbe.caveats?.map((c) => <div key={c} className="cp-notice">{c}</div>)}
    </section>
  );
}
