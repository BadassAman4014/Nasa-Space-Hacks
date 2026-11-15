import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { UKFlag, GermanFlag } from './FlagIcons';
import { useI18n } from '../../i18n';
import type { Language } from '../../i18n/types';

interface LanguageSwitcherProps {
  variant?: 'pill' | 'dropdown' | 'icon-only';
  className?: string;
  dark?: boolean;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({
  variant = 'pill',
  className = '',
  dark = false,
}) => {
  const { language, setLanguage } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleToggle = (lang: Language) => {
    setLanguage(lang);
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Dropdown variant with custom floating menu
  if (variant === 'dropdown') {
    return (
      <div ref={dropdownRef} className={`relative inline-block text-left ${className}`}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-haspopup="true"
          aria-expanded={isOpen}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition shadow-xs cursor-pointer select-none ${
            dark
              ? 'bg-[#181818] hover:bg-[#242424] border-[#333] text-white focus:ring-1 focus:ring-[#1fa35b]'
              : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800 focus:ring-2 focus:ring-[#1fa35b]/20 focus:border-[#1fa35b]'
          }`}
          title={language === 'en' ? 'Select language / Sprache wählen' : 'Sprache wählen / Select language'}
        >
          {language === 'en' ? <UKFlag size="sm" /> : <GermanFlag size="sm" />}
          <span className="font-bold">{language === 'en' ? 'EN' : 'DE'}</span>
          <ChevronDown
            size={13}
            className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''} ${
              dark ? 'text-[#888]' : 'text-slate-400'
            }`}
          />
        </button>

        {isOpen && (
          <div
            className={`absolute top-full right-0 mt-1.5 w-44 rounded-2xl border p-1 shadow-xl z-[700] animate-in fade-in slide-in-from-top-1 ${
              dark
                ? 'bg-[#1f1f1f] border-[#333] text-white shadow-black/50'
                : 'bg-white border-slate-200 text-slate-800 shadow-slate-900/10'
            }`}
            role="menu"
            aria-orientation="vertical"
          >
            <div className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${dark ? 'text-[#777]' : 'text-slate-400'}`}>
              {language === 'en' ? 'Language' : 'Sprache'}
            </div>

            <button
              type="button"
              onClick={() => {
                handleToggle('en');
                setIsOpen(false);
              }}
              role="menuitem"
              className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-xs font-medium transition cursor-pointer ${
                language === 'en'
                  ? dark
                    ? 'bg-[#2a2a2a] text-[#1fa35b] font-bold'
                    : 'bg-emerald-50 text-emerald-800 font-bold'
                  : dark
                    ? 'hover:bg-[#282828] text-slate-200'
                    : 'hover:bg-slate-50 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <UKFlag size="sm" />
                <div className="text-left">
                  <div className="leading-tight font-semibold">English</div>
                  <div className={`text-[10px] ${dark ? 'text-[#888]' : 'text-slate-400'} font-normal`}>English (UK)</div>
                </div>
              </div>
              {language === 'en' && <Check size={14} className="text-[#1fa35b] shrink-0" />}
            </button>

            <button
              type="button"
              onClick={() => {
                handleToggle('de');
                setIsOpen(false);
              }}
              role="menuitem"
              className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-xs font-medium transition cursor-pointer ${
                language === 'de'
                  ? dark
                    ? 'bg-[#2a2a2a] text-[#1fa35b] font-bold'
                    : 'bg-emerald-50 text-emerald-800 font-bold'
                  : dark
                    ? 'hover:bg-[#282828] text-slate-200'
                    : 'hover:bg-slate-50 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <GermanFlag size="sm" />
                <div className="text-left">
                  <div className="leading-tight font-semibold">Deutsch</div>
                  <div className={`text-[10px] ${dark ? 'text-[#888]' : 'text-slate-400'} font-normal`}>Deutsch (DE)</div>
                </div>
              </div>
              {language === 'de' && <Check size={14} className="text-[#1fa35b] shrink-0" />}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (variant === 'pill') {
    return (
      <div
        className={`inline-flex items-center ${
          dark ? 'bg-[#181818] border-[#333]' : 'bg-slate-100 dark:bg-slate-800 border-slate-200/80 dark:border-slate-700/80'
        } p-0.5 rounded-xl border text-xs font-bold ${className}`}
        role="group"
        aria-label="Language selector"
      >
        <button
          type="button"
          onClick={() => handleToggle('en')}
          aria-pressed={language === 'en'}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all ${
            language === 'en'
              ? dark
                ? 'bg-[#2a2a2a] text-white shadow-xs font-extrabold'
                : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-extrabold'
              : dark
                ? 'text-[#888] hover:text-[#ccc]'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
          title="Switch to English"
        >
          <UKFlag size="sm" />
          <span>EN</span>
        </button>

        <button
          type="button"
          onClick={() => handleToggle('de')}
          aria-pressed={language === 'de'}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all ${
            language === 'de'
              ? dark
                ? 'bg-[#2a2a2a] text-white shadow-xs font-extrabold'
                : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-extrabold'
              : dark
                ? 'text-[#888] hover:text-[#ccc]'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
          title="Zu Deutsch wechseln"
        >
          <GermanFlag size="sm" />
          <span>DE</span>
        </button>
      </div>
    );
  }

  // Icon only toggle button
  return (
    <button
      type="button"
      onClick={() => handleToggle(language === 'en' ? 'de' : 'en')}
      className={`p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 ${className}`}
      title={language === 'en' ? 'Zu Deutsch wechseln' : 'Switch to English'}
    >
      <span className="text-sm" role="img" aria-label="flag">
        {language === 'en' ? '🇬🇧' : '🇩🇪'}
      </span>
      <span>{language === 'en' ? 'EN' : 'DE'}</span>
    </button>
  );
};
