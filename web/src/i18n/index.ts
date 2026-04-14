import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { applyDocumentLanguage, readStoredLocale } from './constants';
import { ar } from './locales/ar';
import { en } from './locales/en';

const initial = readStoredLocale();
applyDocumentLanguage(initial);

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar },
  },
  lng: initial,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (lng) => {
  applyDocumentLanguage(lng === 'ar' ? 'ar' : 'en');
});

export default i18n;
