export type Language = 'en' | 'de';

export type TranslationParams = Record<string, string | number>;

export interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: TranslationParams) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatDate: (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  formatHectares: (ha: number) => string;
  isFirstLaunch: boolean;
  completeFirstLaunch: (lang: Language) => void;
  isLanguageModalOpen: boolean;
  openLanguageModal: () => void;
  closeLanguageModal: () => void;
}
