import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { en } from './locales/en';
import { de } from './locales/de';
import type { Language, I18nContextType, TranslationParams } from './types';

const STORAGE_KEY = 'fieldshift_lang';

const dictionaries = {
  en,
  de,
};

const I18nContext = createContext<I18nContextType | null>(null);

function resolveKey(obj: any, path: string): string | undefined {
  const parts = path.split('.');
  let current: any = obj;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  return typeof current === 'string' ? current : undefined;
}

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  let result = template;
  for (const [key, val] of Object.entries(params)) {
    const regex1 = new RegExp(`\\{${key}\\}`, 'g');
    const regex2 = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex1, String(val)).replace(regex2, String(val));
  }
  return result;
}

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'en' || saved === 'de') return saved;
    } catch {
      // localStorage may fail in private mode
    }
    return 'en';
  });

  const [isFirstLaunch, setIsFirstLaunch] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved !== 'en' && saved !== 'de';
    } catch {
      return false;
    }
  });

  const [isLanguageModalOpen, setIsLanguageModalOpen] = useState(false);

  // Sync html lang attribute
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((newLang: Language) => {
    setLanguageState(newLang);
    try {
      localStorage.setItem(STORAGE_KEY, newLang);
    } catch (e) {
      console.warn('Failed to save language to localStorage:', e);
    }
  }, []);

  const completeFirstLaunch = useCallback((chosenLang: Language) => {
    setLanguage(chosenLang);
    setIsFirstLaunch(false);
  }, [setLanguage]);

  const openLanguageModal = useCallback(() => {
    setIsLanguageModalOpen(true);
  }, []);

  const closeLanguageModal = useCallback(() => {
    setIsLanguageModalOpen(false);
  }, []);

  const t = useCallback(
    (key: string, params?: TranslationParams): string => {
      const dict = dictionaries[language];
      let val = resolveKey(dict, key);
      if (val === undefined && language !== 'en') {
        // Fallback to English
        val = resolveKey(dictionaries.en, key);
      }
      if (val === undefined) {
        return key;
      }
      return interpolate(val, params);
    },
    [language]
  );

  const formatNumber = useCallback(
    (value: number, options?: Intl.NumberFormatOptions): string => {
      const locale = language === 'de' ? 'de-DE' : 'en-US';
      try {
        return new Intl.NumberFormat(locale, options).format(value);
      } catch {
        return value.toString();
      }
    },
    [language]
  );

  const formatDate = useCallback(
    (date: Date | string | number, options?: Intl.DateTimeFormatOptions): string => {
      const locale = language === 'de' ? 'de-DE' : 'en-US';
      const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
      try {
        return new Intl.DateTimeFormat(locale, options).format(d);
      } catch {
        return d.toDateString();
      }
    },
    [language]
  );

  const formatHectares = useCallback(
    (ha: number): string => {
      const numStr = formatNumber(ha, { minimumFractionDigits: 1, maximumFractionDigits: 2 });
      return `${numStr} ha`;
    },
    [formatNumber]
  );

  const contextValue = useMemo<I18nContextType>(
    () => ({
      language,
      setLanguage,
      t,
      formatNumber,
      formatDate,
      formatHectares,
      isFirstLaunch,
      completeFirstLaunch,
      isLanguageModalOpen,
      openLanguageModal,
      closeLanguageModal,
    }),
    [
      language,
      setLanguage,
      t,
      formatNumber,
      formatDate,
      formatHectares,
      isFirstLaunch,
      completeFirstLaunch,
      isLanguageModalOpen,
      openLanguageModal,
      closeLanguageModal,
    ]
  );

  return <I18nContext.Provider value={contextValue}>{children}</I18nContext.Provider>;
};

export function useI18n(): I18nContextType {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return ctx;
}
