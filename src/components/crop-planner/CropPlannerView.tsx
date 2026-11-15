import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useI18n } from '../../i18n';
import { soilApi, type SoilProfileResponse } from '../../services/soilApi';
import type { SavedField } from '../../services/boundariesApi';
import { cropPlannerApi, PlannerApiError } from '../../services/cropPlannerApi';
import { FarmerInputForm, type InputValues } from './FarmerInputForm';
import { NutrientPlanTab } from './NutrientPlanTab';
import { RotationStrategiesTab } from './RotationStrategiesTab';
import { VulnerabilityTimeline } from './VulnerabilityTimeline';
import type { PlannerInputs, Recommendation } from './types';
import './crop-planner.css';

type Tab = 'strategies' | 'timeline' | 'nutrient';

interface Props {
  fields: SavedField[];
  fieldId: string;
  onSelectField: (id: string) => void;
  notify: (message: string) => void;
}

export function CropPlannerView({ fields, fieldId, onSelectField, notify }: Props) {
  const { t } = useI18n();
  const [soilProfile, setSoilProfile] = useState<SoilProfileResponse | null>(null);
  const [soilError, setSoilError] = useState<string | null>(null);
  const [inputs, setInputs] = useState<PlannerInputs | null>(null);
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [selected, setSelected] = useState('B');
  const [tab, setTab] = useState<Tab>('strategies');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fieldKnown = fields.some((field) => field.id === fieldId);

  const load = useCallback(async (id: string, refresh = false) => {
    setLoading(true);
    setError(null);
    setSoilError(null);
    try {
      const inputsPromise = cropPlannerApi.inputs(id);
      const soilPromise = (refresh
        ? soilApi.refreshSoil(id)
        : soilApi.getSoilProfile(id).then(async (profile) => {
            if (profile.topsoil_summary || profile.status === 'processing') return profile;
            return soilApi.extractSoil(id);
          })).catch((soilFailure) => {
            setSoilError(soilFailure instanceof Error ? soilFailure.message : String(soilFailure));
            return null;
          });
      const [plannerInputs, profile] = await Promise.all([inputsPromise, soilPromise]);
      setInputs(plannerInputs);
      setSoilProfile(profile);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setRec(null);
    setSoilProfile(null);
    setInputs(null);
    setProblems([]);
    if (fieldId && fieldKnown) void load(fieldId);
  }, [fieldId, fieldKnown, load]);

  const persistInputs = async (v: InputValues) => {
    const saved = await cropPlannerApi.saveInputs(fieldId, v);
    setInputs(saved);
    return saved;
  };

  const save = async (v: InputValues) => {
    setProblems([]);
    try {
      await persistInputs(v);
    } catch (e) {
      setProblems(e instanceof PlannerApiError ? [e.message] : [String(e)]);
      throw e;
    }
  };

  const generate = async (v: InputValues) => {
    setBusy(true);
    setProblems([]);
    try {
      await persistInputs(v);
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
      {soilError && <div className="cp-notice warn">Automatic SoilGrids evidence unavailable: {soilError}</div>}
      {loading && <div className="cp-notice">{t('cropPlanner.loading')}</div>}

      {inputs && (
        <FarmerInputForm
          inputs={inputs}
          soilProfile={soilProfile}
          busy={busy}
          problems={problems}
          onSave={save}
          onGenerate={generate}
        />
      )}

      <div className="cp-tabs" role="tablist">
        {(['strategies', 'timeline', 'nutrient'] as Tab[]).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
            {t(`cropPlanner.tabs.${k}`)}
          </button>
        ))}
      </div>

      {!rec && <div className="cp-notice">{t('cropPlanner.strategies.needInputs')}</div>}
      {tab === 'strategies' && rec && <RotationStrategiesTab rec={rec} selected={sel?.id ?? 'A'} onSelect={setSelected} />}
      {tab === 'timeline' && rec && <VulnerabilityTimeline rec={rec} selectedId={sel?.id ?? 'A'} />}
      {tab === 'nutrient' && rec && sel && <NutrientPlanTab strategy={sel} />}
    </div>
  );
}
