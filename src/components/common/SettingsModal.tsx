import React, { useState } from 'react';
import { Settings, Globe2, X, Check, Sliders, ShieldCheck } from 'lucide-react';
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
      className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div className="relative w-full max-w-lg bg-white rounded-3xl border border-gray-200 shadow-2xl p-6 sm:p-7 text-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-[#1fa35b] border border-emerald-100 flex items-center justify-center">
              <Settings size={18} />
            </div>
            <div>
              <h3 id="settings-modal-title" className="text-base sm:text-lg font-bold text-gray-900">
                {t('settings.title')}
              </h3>
              <p className="text-xs text-gray-500">
                {t('settings.subtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-6">
          {/* 1. Language Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                <Globe2 size={15} className="text-[#1fa35b]" />
                <span>{t('settings.languageSection')}</span>
              </label>
              <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200/70 px-2 py-0.5 rounded-full">
                {language === 'de' ? 'Aktiv: Deutsch 🇩🇪' : 'Active: English 🇬🇧'}
              </span>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              {t('settings.languageDesc')}
            </p>

            <div className="grid grid-cols-2 gap-3">
              {/* English Button */}
              <button
                type="button"
                onClick={() => handleLanguageChange('en')}
                className={`p-3.5 rounded-2xl border-2 text-left flex items-center justify-between transition-all cursor-pointer ${
                  language === 'en'
                    ? 'border-[#1fa35b] bg-[#f0fdf4] text-gray-900 shadow-xs ring-2 ring-[#1fa35b]/10'
                    : 'border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50/80 text-gray-700'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl" role="img" aria-label="UK flag">🇬🇧</span>
                  <div>
                    <div className="text-xs font-extrabold text-gray-900">English</div>
                    <div className="text-[10px] text-gray-500">UK / Global</div>
                  </div>
                </div>
                {language === 'en' && (
                  <div className="w-5 h-5 rounded-full bg-[#1fa35b] text-white flex items-center justify-center shadow-xs">
                    <Check size={12} strokeWidth={3} />
                  </div>
                )}
              </button>

              {/* Deutsch Button */}
              <button
                type="button"
                onClick={() => handleLanguageChange('de')}
                className={`p-3.5 rounded-2xl border-2 text-left flex items-center justify-between transition-all cursor-pointer ${
                  language === 'de'
                    ? 'border-[#1fa35b] bg-[#f0fdf4] text-gray-900 shadow-xs ring-2 ring-[#1fa35b]/10'
                    : 'border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50/80 text-gray-700'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl" role="img" aria-label="German flag">🇩🇪</span>
                  <div>
                    <div className="text-xs font-extrabold text-gray-900">Deutsch</div>
                    <div className="text-[10px] text-gray-500">Brandenburg / DE</div>
                  </div>
                </div>
                {language === 'de' && (
                  <div className="w-5 h-5 rounded-full bg-[#1fa35b] text-white flex items-center justify-center shadow-xs">
                    <Check size={12} strokeWidth={3} />
                  </div>
                )}
              </button>
            </div>
          </div>

          {/* 2. Units of Measurement */}
          <div className="pt-2 border-t border-gray-100">
            <label className="text-xs font-bold text-gray-900 flex items-center gap-1.5 mb-1.5">
              <Sliders size={15} className="text-[#1fa35b]" />
              <span>{t('settings.unitsSection')}</span>
            </label>
            <p className="text-xs text-gray-500 mb-3">
              {t('settings.unitsDesc')}
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setUnitSystem('metric')}
                className={`p-3 rounded-xl border text-xs text-center transition cursor-pointer ${
                  unitSystem === 'metric'
                    ? 'border-2 border-[#1fa35b] bg-[#f0fdf4] text-[#15803d] font-bold shadow-xs'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50 font-medium'
                }`}
              >
                {t('settings.metricLabel')}
              </button>

              <button
                type="button"
                onClick={() => setUnitSystem('imperial')}
                className={`p-3 rounded-xl border text-xs text-center transition cursor-pointer ${
                  unitSystem === 'imperial'
                    ? 'border-2 border-[#1fa35b] bg-[#f0fdf4] text-[#15803d] font-bold shadow-xs'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50 font-medium'
                }`}
              >
                {t('settings.imperialLabel')}
              </button>
            </div>
          </div>

          {/* 3. Regional sync info */}
          <div className="p-3.5 rounded-2xl bg-gray-50/80 border border-gray-200 text-xs flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-[#1fa35b] border border-emerald-200 flex items-center justify-center shrink-0">
              <ShieldCheck size={16} />
            </div>
            <div>
              <div className="font-bold text-gray-900">
                {language === 'de' ? 'DFBK & ISRIC Synchronisiert' : 'DFBK & ISRIC Synchronized'}
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5">
                {language === 'de'
                  ? 'Landwirtschaftsreferenz Brandenburg · dl-de/by-2-0'
                  : 'Brandenburg Agricultural Reference · dl-de/by-2-0'}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 pt-5 mt-6 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition cursor-pointer"
          >
            {t('settings.closeBtn')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2.5 rounded-xl bg-[#1fa35b] hover:bg-[#188a4c] text-white font-bold text-xs shadow-sm hover:shadow transition cursor-pointer"
          >
            {t('settings.saveBtn')}
          </button>
        </div>
      </div>
    </div>
  );
};
