import { useTranslation } from 'react-i18next';

/** BCP 47 locale for dates/numbers in Kuwait context. */
export function useAppLocale(): string {
  const { i18n } = useTranslation();
  return i18n.language.startsWith('ar') ? 'ar-KW' : 'en-KW';
}
