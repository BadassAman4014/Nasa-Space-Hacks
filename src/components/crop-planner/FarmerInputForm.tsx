import { useEffect, useState } from 'react';
import { Plus, Sprout, X } from 'lucide-react';
import { useI18n } from '../../i18n';
import type { SoilProfileResponse } from '../../services/soilApi';
import type { PlannerInputs } from './types';

export interface InputValues {
  history: { year: number; crop: string }[];
  soil_texture: string | null;
  priority: string | null;
  irrigation: string | null;
}

interface Props {
  inputs: PlannerInputs;
  soilProfile: SoilProfileResponse | null;
  busy: boolean;
  problems: string[];
  onSave: (v: InputValues) => Promise<void>;
  onGenerate: (v: InputValues) => Promise<void>;
}

/** Rows start empty: the farmer's own record is the only source of crop history. Years are suggestions, not data. */
function initialRows(inputs: PlannerInputs): { year: number; crop: string }[] {
  if (inputs.history.length) return inputs.history.map((h) => ({ ...h }));
  const y = new Date().getFullYear();
  return [y - 2, y - 1, y].map((year) => ({ year, crop: '' }));
}

export function FarmerInputForm({ inputs, soilProfile, busy, problems, onSave, onGenerate }: Props) {
  const { t, language } = useI18n();
  const [rows, setRows] = useState(() => initialRows(inputs));
  const [soil, setSoil] = useState(inputs.soil_texture ?? '');
  const [priority, setPriority] = useState(inputs.priority ?? '');
  const [irrigation, setIrrigation] = useState(inputs.irrigation ?? '');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setRows(initialRows(inputs));
    setSoil(inputs.soil_texture ?? '');
    setPriority(inputs.priority ?? '');
    setIrrigation(inputs.irrigation ?? '');
  }, [inputs.field_id, inputs.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const values = (): InputValues => ({
    history: rows.filter((r) => r.crop).map((r) => ({ year: Number(r.year), crop: r.crop })),
    soil_texture: soil || null,
    priority: priority || null,
    irrigation: irrigation || null,
  });
  const label = (c: { label_en: string; label_de: string; scored: boolean }) =>
    (language === 'de' ? c.label_de : c.label_en) + (c.scored ? '' : ` ${t('cropPlanner.form.notScoredCrop')}`);

  const setRow = (i: number, patch: Partial<{ year: number; crop: string }>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  return (
    <section className="cp-card">
      <div>
        <h2><Sprout size={16} style={{ verticalAlign: -2 }} /> {t('cropPlanner.form.title')}</h2>
        <p className="cp-sub">{t('cropPlanner.form.subtitle')}</p>
      </div>
      <div className="cp-form">
        <div className="cp-hist">
          <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{t('cropPlanner.form.history')}</span>
          {rows.map((r, i) => (
            <div className="cp-hist-row" key={i}>
              <input type="number" aria-label={t('cropPlanner.form.year')} value={r.year} onChange={(e) => setRow(i, { year: Number(e.target.value) })} />
              <select aria-label={t('cropPlanner.form.crop')} value={r.crop} onChange={(e) => setRow(i, { crop: e.target.value })}>
                <option value="">{t('cropPlanner.form.choose')}</option>
                {inputs.options.crops.map((c) => <option key={c.id} value={c.id}>{label(c)}</option>)}
              </select>
              {rows.length > 2 && (
                <button type="button" className="cp-btn ghost" onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))} title={t('cropPlanner.form.removeYear')}><X size={14} /></button>
              )}
            </div>
          ))}
          {rows.length < 3 && (
            <button type="button" className="cp-btn ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setRows((rs) => [{ year: rs[0].year - 1, crop: '' }, ...rs])}>
              <Plus size={14} /> {t('cropPlanner.form.addYear')}
            </button>
          )}
        </div>
        {soilProfile?.topsoil_summary && (
          <div className="cp-soil-evidence" aria-label="Automatic SoilGrids evidence">
            <div className="cp-row" style={{ justifyContent: 'space-between' }}>
              <strong>Automatic SoilGrids evidence</strong>
              <span className="cp-badge">{soilProfile.source} · {soilProfile.spatial_resolution}</span>
            </div>
            <p className="cp-sub">
              {soilProfile.topsoil_summary.texture_class} · sand {soilProfile.topsoil_summary.sand_pct}% ·
              silt {soilProfile.topsoil_summary.silt_pct}% · clay {soilProfile.topsoil_summary.clay_pct}% ·
              pH {soilProfile.topsoil_summary.ph}
            </p>
            <p className="cp-src">Read-only model evidence. It is not copied into the farmer-entered soil texture below.</p>
          </div>
        )}
        <label>
          {t('cropPlanner.form.soil')} <span className="cp-badge">farmer-entered</span>
          <select value={soil} onChange={(e) => setSoil(e.target.value)}>
            <option value="">{t('cropPlanner.form.choose')}</option>
            {inputs.options.soil_texture.map((s) => <option key={s.id} value={s.id}>{language === 'de' ? s.de : `${s.en} (${s.de})`}</option>)}
          </select>
        </label>
        <label>
          {t('cropPlanner.form.priority')}
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">{t('cropPlanner.form.choose')}</option>
            {inputs.options.priority.map((p) => <option key={p} value={p}>{t(`cropPlanner.form.priorities.${p}`)}</option>)}
          </select>
        </label>
        <label>
          {t('cropPlanner.form.irrigation')}
          <select value={irrigation} onChange={(e) => setIrrigation(e.target.value)}>
            <option value="">{t('cropPlanner.form.choose')}</option>
            <option value="rainfed">{t('cropPlanner.form.rainfed')}</option>
            <option value="irrigated">{t('cropPlanner.form.irrigated')}</option>
          </select>
        </label>
      </div>
      {problems.length > 0 && (
        <div className="cp-notice error" role="alert"><ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul></div>
      )}
      {saved && !problems.length && <div className="cp-notice">{t('cropPlanner.form.saved')}</div>}
      <div className="cp-row">
        <button className="cp-btn ghost" disabled={busy} onClick={async () => { await onSave(values()); setSaved(true); }}>{t('cropPlanner.form.save')}</button>
        <button className="cp-btn" disabled={busy} onClick={async () => { setSaved(false); await onGenerate(values()); }}>
          {busy ? t('cropPlanner.form.generating') : t('cropPlanner.form.generate')}
        </button>
      </div>
    </section>
  );
}
