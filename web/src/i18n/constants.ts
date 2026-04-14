export const LOCALE_STORAGE_KEY = 'safari_erp_locale';

export type AppLocale = 'en' | 'ar';

export function readStoredLocale(): AppLocale {
  try {
    const v = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (v === 'ar' || v === 'en') return v;
  } catch {
    /* ignore */
  }
  return 'en';
}

export function writeStoredLocale(locale: AppLocale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
}

export function applyDocumentLanguage(locale: AppLocale): void {
  if (typeof document === 'undefined') return;
  const rtl = locale === 'ar';
  document.documentElement.dir = rtl ? 'rtl' : 'ltr';
  document.documentElement.lang = rtl ? 'ar' : 'en';
}
