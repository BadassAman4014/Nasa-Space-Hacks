import React, { useState } from 'react';
import { Settings, Globe2, X, Check, Sliders, ShieldCheck, MapPin } from 'lucide-react';
import { useI18n } from '../../i18n';
import type { Language } from '../../i18n/types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  notify?: (msg: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, notify }) => {
  const { language, setLanguage, t } = useI18n();
  const [unitSystem, setUnitSystem] = useState<'metric' | 'imperial'>('metric');

  if (!isOpen) return null;

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang);
    if (notify) {
      notify(
        lang === 'de'
          ? 'Sprache auf Deutsch geändert.'
          : 'Language switched to English.'
      );
    }
  };

  const handleSave = () => {
    onClose();
    if (notify) {
      notify(t('settings.savedNotification'));
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div className="relative w-full max-w-lg bg-white dark:bg-[#1f2224] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 sm:p-7 text-slate-800 dark:text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Settings size={18} />
            </div>
            <div>
              <h3 id="settings-modal-title" className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                {t('settings.title')}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('settings.subtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-6">
          {/* 1. Language Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Globe2 size={15} className="text-emerald-600 dark:text-emerald-400" />
                <span>{t('settings.languageSection')}</span>
              </label>
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                {language === 'de' ? 'Aktiv: Deutsch 🇩🇪' : 'Active: English 🇬🇧'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              {t('settings.languageDesc')}
            </p>

            <div className="grid grid-cols-2 gap-3">
              {/* English Button */}
              <button
                type="button"
                onClick={() => handleLanguageChange('en')}
                className={`p-3.5 rounded-xl border-2 text-left flex items-center justify-between transition-all ${
                  language === 'en'
                    ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/20 text-slate-900 dark:text-white shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-xl" role="img" aria-label="UK flag">🇬🇧</span>
                  <div>
                    <div className="text-xs font-extrabold text-slate-900 dark:text-white">English</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">UK / Global</div>
                  </div>
                </div>
                {language === 'en' && (
                  <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                    <Check size={12} strokeWidth={3} />
                  </div>
                )}
              </button>

              {/* Deutsch Button */}
              <button
                type="button"
                onClick={() => handleLanguageChange('de')}
                className={`p-3.5 rounded-xl border-2 text-left flex items-center justify-between transition-all ${
                  language === 'de'
                    ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/20 text-slate-900 dark:text-white shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-xl" role="img" aria-label="German flag">🇩🇪</span>
                  <div>
                    <div className="text-xs font-extrabold text-slate-900 dark:text-white">Deutsch</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">Brandenburg / DE</div>
                  </div>
                </div>
                {language === 'de' && (
                  <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                    <Check size={12} strokeWidth={3} />
                  </div>
                )}
              </button>
            </div>
          </div>

          {/* 2. Units of Measurement */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mb-1.5">
              <Sliders size={15} className="text-emerald-600 dark:text-emerald-400" />
              <span>{t('settings.unitsSection')}</span>
            </label>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              {t('settings.unitsDesc')}
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setUnitSystem('metric')}
                className={`p-3 rounded-xl border text-xs font-semibold text-center transition ${
                  unitSystem === 'metric'
                    ? 'border-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300 font-bold'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                {t('settings.metricLabel')}
              </button>

              <button
                type="button"
                onClick={() => setUnitSystem('imperial')}
                className={`p-3 rounded-xl border text-xs font-semibold text-center transition ${
                  unitSystem === 'imperial'
                    ? 'border-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300 font-bold'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                {t('settings.imperialLabel')}
              </button>
            </div>
          </div>

          {/* 3. Regional sync info */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 text-xs flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 flex items-center justify-center flex-shrink-0">
              <ShieldCheck size={16} />
            </div>
            <div>
              <div className="font-bold text-slate-900 dark:text-white">
                {language === 'de' ? 'DFBK & ISRIC Synchronisiert' : 'DFBK & ISRIC Synchronized'}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {language === 'de'
                  ? 'Landwirtschaftsreferenz Brandenburg · dl-de/by-2-0'
                  : 'Brandenburg Agricultural Reference · dl-de/by-2-0'}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 pt-5 mt-6 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            {t('settings.closeBtn')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 rounded-xl bg-[#1fa35b] hover:bg-[#188a4c] text-white font-bold text-xs shadow-md transition"
          >
            {t('settings.saveBtn')}
          </button>
        </div>
      </div>
    </div>
  );
};
