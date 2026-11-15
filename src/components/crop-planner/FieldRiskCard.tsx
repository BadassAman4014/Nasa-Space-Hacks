import { useI18n } from '../../i18n';
import { ProvenanceBadge } from './ProvenanceBadge';
import type { RiskCardData, RiskItem } from './types';

function RiskTile({ item }: { item: RiskItem }) {
  const { t } = useI18n();
  const cls = item.level === 'unavailable' ? '' : item.level;
  return (
    <div className={`cp-risk ${cls}`}>
      <div className="cp-risk-top">
        <strong>{item.label}</strong>
        <span className={`cp-level ${item.level}`}>{t(`cropPlanner.risk.level.${item.level}`)}</span>
      </div>
      <p>{item.reading}</p>
      {item.source_used && <span className="cp-src">{item.source_used}</span>}
      {item.as_of && <ProvenanceBadge provenance="cached" asOf={item.as_of} />}
      {item.factors && item.factors.length > 0 && (
        <details>
          <summary>{t('cropPlanner.risk.method')}</summary>
          <table>
            <tbody>
              {item.factors.map((f) => (
                <tr key={f.factor}>
                  <td><strong>{f.factor}</strong></td>
                  <td>{f.value}{f.reason ? ` (${f.reason})` : ''}</td>
                  <td>{f.points === null ? '–' : `${f.points} pt`}</td>
                  <td><ProvenanceBadge provenance={f.provenance ?? 'unavailable'} asOf={f.as_of} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {item.method && <p className="cp-src">{item.method}</p>}
        </details>
      )}
      {!item.factors && item.method && (
        <details>
          <summary>{t('cropPlanner.risk.method')}</summary>
          <p className="cp-src">{item.method}</p>
        </details>
      )}
      {item.sources && <span className="cp-src">{t('cropPlanner.risk.source')}: {item.sources.join('; ')}</span>}
    </div>
  );
}

export function FieldRiskCard({ card }: { card: RiskCardData }) {
  const { t } = useI18n();
  const soil = card.soil_texture;
  return (
    <section className="cp-card">
      <div>
        <h2>{t('cropPlanner.risk.title')} · {card.field_name}</h2>
        <p className="cp-sub">{t('cropPlanner.risk.subtitle')}</p>
      </div>
      <div className="cp-risk-grid">
        {card.items.map((i) => <RiskTile key={i.id} item={i} />)}
      </div>
      {(soil.farmer || soil.satellite) && (
        <p className="cp-sub">
          {soil.farmer && <>{t('cropPlanner.risk.soilFarmer')}: <strong>{soil.farmer}</strong> <span className="cp-badge">farmer-provided</span> </>}
          {soil.satellite && <>· {t('cropPlanner.risk.soilSatellite')}: {soil.satellite}</>}
          {soil.check?.note && <span className="cp-notice warn" style={{ display: 'block', marginTop: 6 }}>{soil.check.note}</span>}
        </p>
      )}
    </section>
  );
}
