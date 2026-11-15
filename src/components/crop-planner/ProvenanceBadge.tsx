import { useI18n } from '../../i18n';
import type { Provenance } from './types';

export function ProvenanceBadge({ provenance, asOf }: { provenance: Provenance | undefined; asOf?: string | null }) {
  const { t, formatDate } = useI18n();
  if (!provenance) return null;
  const date = asOf ? formatDate(asOf, { year: 'numeric', month: 'short', day: 'numeric' }) : null;
  return (
    <span className={`cp-badge ${provenance}`} title={date ? t('cropPlanner.provenance.asOf', { date }) : undefined}>
      {t(`cropPlanner.provenance.${provenance}`)}
      {date && provenance !== 'unavailable' ? ` · ${date}` : ''}
    </span>
  );
}
