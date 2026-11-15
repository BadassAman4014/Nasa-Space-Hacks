import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useI18n } from '../../i18n';
import { baseUrl } from '../../services/apiClient';
import { cropPlannerApi, PlannerApiError } from '../../services/cropPlannerApi';
import { FarmerInputForm, type InputValues } from './FarmerInputForm';
import { FieldRiskCard } from './FieldRiskCard';
import { NutrientPlanTab } from './NutrientPlanTab';
import { RotationStrategiesTab } from './RotationStrategiesTab';
import { VulnerabilityTimeline } from './VulnerabilityTimeline';
import type { PlannerInputs, Recommendation, RiskCardData } from './types';
import './crop-planner.css';

type Tab = 'risk' | 'strategies' | 'timeline' | 'nutrient';
interface FieldRow { id: string; name: string; farm_name?: string }

interface Props {
  fieldId: string;
  onSelectField: (id: string) => void;
  notify: (message: string) => void;
}

export function CropPlannerView({ fieldId, onSelectField, notify }: Props) {
  const { t } = useI18n();
  const [fields, setFields] = useState<FieldRow[] | null>(null);
  const [card, setCard] = useState<RiskCardData | null>(null);
  const [inputs, setInputs] = useState<PlannerInputs | null>(null);
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [selected, setSelected] = useState('B');
  const [tab, setTab] = useState<Tab>('risk');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${baseUrl}/fields`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: FieldRow[]) => setFields(Array.isArray(list) ? list : []))
      .catch(() => setFields([]));
  }, []);

  const fieldKnown = !!fields?.some((f) => f.id === fieldId);

  const load = useCallback(async (id: string, refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const [c, i] = await Promise.all([cropPlannerApi.riskCard(id, refresh), cropPlannerApi.inputs(id)]);
      setCard(c);
      setInputs(i);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setRec(null);
    setCard(null);
    setInputs(null);
    setProblems([]);
    if (fieldId && fieldKnown) void load(fieldId);
  }, [fieldId, fieldKnown, load]);

  const save = async (v: InputValues) => {
    setProblems([]);
    try {
      const saved = await cropPlannerApi.saveInputs(fieldId, v);
      setInputs(saved);
      setCard(await cropPlannerApi.riskCard(fieldId));
    } catch (e) {
      setProblems(e instanceof PlannerApiError ? [e.message] : [String(e)]);
      throw e;
    }
  };

  const generate = async (v: InputValues) => {
    setBusy(true);
    setProblems([]);
    try {
      await save(v);
      const r = await cropPlannerApi.generate(fieldId);
      setRec(r);
      setSelected(r.strategies.find((s) => s.id === 'B') ? 'B' : 'A');
      setTab('strategies');
      notify(t('cropPlanner.strategies.title'));
    } catch (e) {
      if (e instanceof PlannerApiError && e.problems.length) setProblems(e.problems);
      else if (!problems.length) setProblems([e instanceof Error ? e.message : String(e)]);
    } finally {
      setBusy(false);
    }
  };

  const sel = rec?.strategies.find((s) => s.id === selected) ?? rec?.strategies[0];

  return (
    <div className="cp">
      <div className="cp-head">
        <div>
          <div className="eyebrow">{t('cropPlanner.eyebrow')}</div>
          <h1>{t('cropPlanner.title')}</h1>
          <p>{t('cropPlanner.description')}</p>
        </div>
        <div className="cp-row">
          <label className="cp-field">
            {t('cropPlanner.field')}
            <select value={fieldKnown ? fieldId : ''} onChange={(e) => onSelectField(e.target.value)} disabled={!fields?.length}>
              {!fieldKnown && <option value="">–</option>}
              {fields?.map((f) => <option key={f.id} value={f.id}>{f.name}{f.farm_name ? ` · ${f.farm_name}` : ''}</option>)}
            </select>
          </label>
          <button className="cp-btn ghost" onClick={() => void load(fieldId, true)} disabled={loading || !fieldKnown}>
            <RefreshCw size={14} /> {t('cropPlanner.refresh')}
          </button>
        </div>
      </div>

      {fields && fields.length === 0 && <div className="cp-notice warn">{t('cropPlanner.noFields')}</div>}
      {error && <div className="cp-notice error" role="alert">{error}</div>}
      {loading && <div className="cp-notice">{t('cropPlanner.loading')}</div>}

      {inputs && (
        <FarmerInputForm inputs={inputs} busy={busy} problems={problems} onSave={save} onGenerate={generate} />
      )}

      <div className="cp-tabs" role="tablist">
        {(['risk', 'strategies', 'timeline', 'nutrient'] as Tab[]).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
            {t(`cropPlanner.tabs.${k}`)}
          </button>
        ))}
      </div>

      {tab === 'risk' && card && <FieldRiskCard card={card} />}
      {tab !== 'risk' && !rec && <div className="cp-notice">{t('cropPlanner.strategies.needInputs')}</div>}
      {tab === 'strategies' && rec && <RotationStrategiesTab rec={rec} selected={sel?.id ?? 'A'} onSelect={setSelected} />}
      {tab === 'timeline' && rec && <VulnerabilityTimeline rec={rec} selectedId={sel?.id ?? 'A'} />}
      {tab === 'nutrient' && rec && sel && <NutrientPlanTab strategy={sel} />}
    </div>
  );
}
