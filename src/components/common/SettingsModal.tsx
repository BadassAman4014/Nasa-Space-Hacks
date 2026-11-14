import React, { useState } from 'react';
import { Settings, Globe, Ruler, X, Check } from 'lucide-react';
import { UKFlag, GermanFlag } from './FlagIcons';
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
      className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div className="relative w-full max-w-[520px] bg-white rounded-[26px] border border-gray-100 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.18)] p-6 sm:p-7 text-gray-900">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#eaf8ee] text-[#2e9e5b] flex items-center justify-center shrink-0">
              <Settings size={20} strokeWidth={2.2} />
            </div>
            <div className="h-5 w-[1.5px] bg-gray-200" />
            <h3 id="settings-modal-title" className="text-xl font-bold text-gray-900 tracking-tight">
              {t('settings.title')}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition cursor-pointer"
            aria-label="Close"
          >
            <X size={20} strokeWidth={2} />
          </button>
        </div>

        <div className="pt-4 space-y-3">
          {/* Row 1: Language */}
          <div className="rounded-2xl border border-gray-200/90 bg-white p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#eaf8ee] text-[#2e9e5b] flex items-center justify-center shrink-0">
                <Globe size={18} strokeWidth={2.2} />
              </div>
              <span className="text-sm font-bold text-gray-900">
                {t('settings.language')}
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              {/* English Button */}
              <button
                type="button"
                onClick={() => handleLanguageChange('en')}
                className={`px-3.5 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition cursor-pointer ${
                  language === 'en'
                    ? 'border border-[#2e9e5b] bg-[#f0fbf4] text-gray-900 shadow-2xs'
                    : 'border border-gray-200 bg-white hover:border-gray-300 text-gray-800 font-medium'
                }`}
              >
                <UKFlag />
                <span>English</span>
                {language === 'en' && (
                  <div className="w-4.5 h-4.5 rounded-full bg-[#2e9e5b] text-white flex items-center justify-center shrink-0 ml-1">
                    <Check size={11} strokeWidth={3} />
                  </div>
                )}
              </button>

              {/* Deutsch Button */}
              <button
                type="button"
                onClick={() => handleLanguageChange('de')}
                className={`px-3.5 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition cursor-pointer ${
                  language === 'de'
                    ? 'border border-[#2e9e5b] bg-[#f0fbf4] text-gray-900 shadow-2xs'
                    : 'border border-gray-200 bg-white hover:border-gray-300 text-gray-800 font-medium'
                }`}
              >
                <GermanFlag />
                <span>Deutsch</span>
                {language === 'de' && (
                  <div className="w-4.5 h-4.5 rounded-full bg-[#2e9e5b] text-white flex items-center justify-center shrink-0 ml-1">
                    <Check size={11} strokeWidth={3} />
                  </div>
                )}
              </button>
            </div>
          </div>

          {/* Row 2: Units */}
          <div className="rounded-2xl border border-gray-200/90 bg-white p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#eaf8ee] text-[#2e9e5b] flex items-center justify-center shrink-0">
                <Ruler size={18} strokeWidth={2.2} />
              </div>
              <span className="text-sm font-bold text-gray-900">
                {t('settings.units')}
              </span>
            </div>

            <div className="bg-[#f3f4f6] p-1 rounded-xl flex items-center border border-gray-200/60 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setUnitSystem('metric')}
                className={`px-5 sm:px-6 py-1.5 text-center text-sm font-bold rounded-lg transition cursor-pointer ${
                  unitSystem === 'metric'
                    ? 'bg-[#2e9e5b] text-white shadow-xs'
                    : 'text-gray-700 hover:text-gray-900 font-medium'
                }`}
              >
                {t('settings.metric')}
              </button>

              <button
                type="button"
                onClick={() => setUnitSystem('imperial')}
                className={`px-5 sm:px-6 py-1.5 text-center text-sm font-bold rounded-lg transition cursor-pointer ${
                  unitSystem === 'imperial'
                    ? 'bg-[#2e9e5b] text-white shadow-xs'
                    : 'text-gray-700 hover:text-gray-900 font-medium'
                }`}
              >
                {t('settings.imperial')}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 pt-6 mt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-800 transition cursor-pointer"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-7 py-2.5 rounded-xl bg-[#2e9e5b] hover:bg-[#25854b] text-white font-bold text-sm shadow-xs transition cursor-pointer"
          >
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
};
