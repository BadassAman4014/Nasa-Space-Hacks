import React, { useState } from 'react';
import { Check, Globe2, Sparkles, X, ArrowRight, ShieldCheck, Sprout } from 'lucide-react';
import { useI18n } from '../../i18n';
import type { Language } from '../../i18n/types';

interface LanguageSelectModalProps {
  forceOpen?: boolean;
}

export const LanguageSelectModal: React.FC<LanguageSelectModalProps> = ({ forceOpen }) => {
  const {
    language,
    setLanguage,
    isFirstLaunch,
    completeFirstLaunch,
    isLanguageModalOpen,
    closeLanguageModal,
  } = useI18n();

  // Selected language state within modal
  const [selectedLang, setSelectedLang] = useState<Language>(language || 'de');

  // Should modal be shown?
  const isVisible = forceOpen || isFirstLaunch || isLanguageModalOpen;
  if (!isVisible) return null;

  const handleProceed = () => {
    if (isFirstLaunch) {
      completeFirstLaunch(selectedLang);
    } else {
      setLanguage(selectedLang);
      closeLanguageModal();
    }
  };

  const handleCardClick = (lang: Language) => {
    setSelectedLang(lang);
  };

  const isGerman = selectedLang === 'de';

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-300"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lang-modal-title"
    >
      <div className="relative w-full max-w-2xl bg-white dark:bg-[#181a1b] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden p-6 sm:p-8 transition-all">
        {/* Subtle decorative glow */}
        <div className="absolute -top-24 -left-24 w-60 h-60 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-60 h-60 bg-blue-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* Close button if opened manually from settings */}
        {!isFirstLaunch && (
          <button
            onClick={closeLanguageModal}
            className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        )}

        {/* Header */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold tracking-wide uppercase mb-3">
            <Globe2 size={14} className="text-emerald-600 dark:text-emerald-400 animate-pulse" />
            <span>FieldShift AI · Multi-Language</span>
          </div>

          <h2
            id="lang-modal-title"
            className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight"
          >
            {isGerman ? 'Sprache auswählen' : 'Select Your Language'}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-2">
            {isGerman
              ? 'Wählen Sie Ihre bevorzugte Sprache für die gesamte Benutzeroberfläche, Bodenanalysen und Fachberichte.'
              : 'Choose your language to customize navigation, agronomic metrics, and field intelligence.'}
          </p>
        </div>

        {/* Language Options Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-7">
          {/* 1. English Option */}
          <div
            onClick={() => handleCardClick('en')}
            onDoubleClick={handleProceed}
            className={`group relative p-5 rounded-2xl border-2 cursor-pointer transition-all duration-200 flex flex-col justify-between ${
              selectedLang === 'en'
                ? 'border-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-md ring-2 ring-emerald-500/20'
                : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/30'
            }`}
          >
            {/* Top row: Flag, title, radio check */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-3xl sm:text-4xl shadow-xs select-none" role="img" aria-label="UK flag">
                    🇬🇧
                  </span>
                  <div>
                    <h3 className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                      English
                    </h3>
                    <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-400 block">
                      English (UK / EU / Global)
                    </span>
                  </div>
                </div>

                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all ${
                    selectedLang === 'en'
                      ? 'border-emerald-600 bg-emerald-600 text-white shadow-xs'
                      : 'border-slate-300 dark:border-slate-600 bg-transparent'
                  }`}
                >
                  {selectedLang === 'en' && <Check size={14} strokeWidth={3} />}
                </div>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
                Global precision agriculture standard with EU metrics, NASA Earth satellite feeds, and international soil parameters.
              </p>
            </div>

            {/* Badges */}
            <div className="pt-3 border-t border-slate-200/70 dark:border-slate-800 flex flex-wrap gap-1.5">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                NASA SMAP & MODIS
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                Metric / Hectares
              </span>
            </div>
          </div>

          {/* 2. Deutsch Option */}
          <div
            onClick={() => handleCardClick('de')}
            onDoubleClick={handleProceed}
            className={`group relative p-5 rounded-2xl border-2 cursor-pointer transition-all duration-200 flex flex-col justify-between ${
              selectedLang === 'de'
                ? 'border-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-md ring-2 ring-emerald-500/20'
                : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/30'
            }`}
          >
            {/* Top row: Flag, title, radio check */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-3xl sm:text-4xl shadow-xs select-none" role="img" aria-label="German flag">
                    🇩🇪
                  </span>
                  <div>
                    <h3 className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                      Deutsch
                    </h3>
                    <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-400 block">
                      Deutsch (Deutschland / Brandenburg)
                    </span>
                  </div>
                </div>

                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all ${
                    selectedLang === 'de'
                      ? 'border-emerald-600 bg-emerald-600 text-white shadow-xs'
                      : 'border-slate-300 dark:border-slate-600 bg-transparent'
                  }`}
                >
                  {selectedLang === 'de' && <Check size={14} strokeWidth={3} />}
                </div>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
                Maßgeschneidert für deutsche Betriebe: Brandenburger DFBK-Feldblöcke, Düngeverordnung (DüV) und agronomische Fachterminologie.
              </p>
            </div>

            {/* Badges */}
            <div className="pt-3 border-t border-slate-200/70 dark:border-slate-800 flex flex-wrap gap-1.5">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100/70 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                DFBK Brandenburg
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                DüV-Konformität
              </span>
            </div>
          </div>
        </div>

        {/* Action button */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          <p className="text-xs text-slate-400 dark:text-slate-500 text-center sm:text-left">
            {isGerman
              ? 'Die Sprache kann jederzeit in den Einstellungen gewechselt werden.'
              : 'You can change language anytime in platform settings.'}
          </p>

          <button
            type="button"
            onClick={handleProceed}
            className="w-full sm:w-auto px-7 py-3 rounded-xl bg-[#1fa35b] hover:bg-[#188a4c] active:scale-98 text-white font-bold text-sm shadow-lg shadow-emerald-700/20 flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <span>
              {isGerman
                ? 'Mit Deutsch fortfahren'
                : 'Continue with English'}
            </span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
