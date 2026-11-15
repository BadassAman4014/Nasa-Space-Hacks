import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, Sprout, X } from 'lucide-react';
import { fieldHealthApi, type FarmerInputs, type NitrogenEstimate } from '../../../services/fieldHealthApi';
import { useI18n } from '../../../i18n';

interface CropNitrogenDrawerProps {
  fieldId: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  notify: (message: string) => void;
}

export function CropNitrogenDrawer({ fieldId, open, onClose, onSaved, notify }: CropNitrogenDrawerProps) {
  const { t, language } = useI18n();
  const [nitrogen, setNitrogen] = useState<NitrogenEstimate | null>(null);
  const [form, setForm] = useState<Partial<FarmerInputs>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    fieldHealthApi.getCard(fieldId)
      .then((card) => {
        setNitrogen(card.nitrogen);
        setForm(card.nitrogen.inputs || {});
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('fieldAnalytics.inputs.loadError')))
      .finally(() => setLoading(false));
  }, [fieldId, open, t]);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [open, onClose]);

  const valid = useMemo(
    () => Boolean(form.crop && Number(form.yield_target) > 0 && form.nmin_kg_ha !== null && form.nmin_kg_ha !== undefined && Number(form.nmin_kg_ha) >= 0),
    [form.crop, form.yield_target, form.nmin_kg_ha]
  );

  if (!open) return null;

  const numberChange = (key: keyof FarmerInputs) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setForm((current) => ({ ...current, [key]: value === '' ? null : Number(value) }));
  };

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      await fieldHealthApi.saveInputs(fieldId, form);
      notify(t('fieldAnalytics.inputs.saved'));
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fieldAnalytics.inputs.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15';
  const labelClass = 'block text-sm font-bold text-slate-800';

  return (
    <div className="fixed inset-0 z-[1400] bg-slate-950/35 backdrop-blur-[2px]" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="absolute bottom-0 right-0 top-0 flex w-full max-w-[480px] flex-col bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="crop-nitrogen-title">
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Sprout size={20} /></span>
            <div>
              <h2 id="crop-nitrogen-title" className="text-xl font-extrabold text-slate-950">{t('fieldAnalytics.inputs.title')}</h2>
              <p className="text-sm text-slate-600">{t('fieldAnalytics.inputs.subtitle')}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label={t('common.close')}><X size={20} /></button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {loading && <div className="space-y-3" aria-label={t('common.loading')}><div className="h-24 animate-pulse rounded-2xl bg-slate-100" /><div className="h-64 animate-pulse rounded-2xl bg-slate-100" /></div>}
          {error && <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle size={18} className="shrink-0" />{error}</div>}
          {!loading && nitrogen && (
            <div className="space-y-8">
              <fieldset className="space-y-4">
                <legend className="mb-4 text-base font-extrabold text-slate-950">{t('fieldAnalytics.inputs.cropGroup')}</legend>
                <label className={labelClass}>{t('fieldAnalytics.inputs.crop')} *
                  <select className={inputClass} value={form.crop ?? ''} onChange={(event) => setForm((current) => ({ ...current, crop: event.target.value || null }))}>
                    <option value="">{t('fieldAnalytics.inputs.selectCrop')}</option>
                    {Object.entries(nitrogen.options.crops).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                </label>
                <label className={labelClass}>{t('fieldAnalytics.inputs.previousCrop')}
                  <select className={inputClass} value={form.previous_crop ?? ''} onChange={(event) => setForm((current) => ({ ...current, previous_crop: event.target.value || null }))}>
                    <option value="">{t('fieldAnalytics.inputs.selectPreviousCrop')}</option>
                    {Object.entries(nitrogen.options.previous_crops).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                </label>
                <label className={labelClass}>{t('fieldAnalytics.inputs.yieldTarget')} *
                  <input className={inputClass} type="number" min="0.1" step="0.1" inputMode="decimal" value={form.yield_target ?? ''} onChange={numberChange('yield_target')} />
                  <span className="mt-1 block text-xs font-normal text-slate-500">{t('fieldAnalytics.inputs.yieldHelp')}</span>
                </label>
              </fieldset>

              <fieldset className="space-y-4 border-t border-slate-200 pt-6">
                <legend className="mb-4 text-base font-extrabold text-slate-950">{t('fieldAnalytics.inputs.nitrogenGroup')}</legend>
                <label className={labelClass}>{t('fieldAnalytics.inputs.nmin')} *
                  <input className={inputClass} type="number" min="0" step="0.1" inputMode="decimal" value={form.nmin_kg_ha ?? ''} onChange={numberChange('nmin_kg_ha')} />
                  <span className="mt-1 block text-xs font-normal text-slate-500">{t('fieldAnalytics.inputs.nminHelp')}</span>
                </label>
                <label className={labelClass}>{t('fieldAnalytics.inputs.organicN')}
                  <input className={inputClass} type="number" min="0" step="0.1" inputMode="decimal" value={form.organic_n_last_year_kg_ha ?? ''} onChange={numberChange('organic_n_last_year_kg_ha')} />
                </label>
                <label className={labelClass}>{t('fieldAnalytics.inputs.appliedN')}
                  <input className={inputClass} type="number" min="0" step="0.1" inputMode="decimal" value={form.last_n_application_kg_ha ?? ''} onChange={numberChange('last_n_application_kg_ha')} />
                </label>
                <label className={labelClass}>{t('fieldAnalytics.inputs.lastDate')}
                  <input className={inputClass} lang={language === 'de' ? 'de-DE' : 'en-US'} type="date" value={form.last_n_application_date ?? ''} onChange={(event) => setForm((current) => ({ ...current, last_n_application_date: event.target.value || null }))} />
                </label>
              </fieldset>
            </div>
          )}
        </div>

        <footer className="border-t border-slate-200 bg-white px-6 py-4">
          <p className="mb-3 text-xs text-slate-500">{t('fieldAnalytics.inputs.requiredHelp')}</p>
          <button onClick={save} disabled={!valid || saving || loading} className="flex h-11 w-full items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-extrabold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300">
            {saving ? <><Loader2 size={16} className="mr-2 animate-spin" />{t('fieldAnalytics.inputs.saving')}</> : t('fieldAnalytics.inputs.save')}
          </button>
        </footer>
      </aside>
    </div>
  );
}
