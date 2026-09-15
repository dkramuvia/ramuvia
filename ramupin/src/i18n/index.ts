import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import ko from './locales/ko.json';

export const SUPPORTED_LANGUAGES = ['ko', 'en'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

const deviceLanguage = getLocales()[0]?.languageCode;
// 한국어 우선 개발: 기기 언어가 영어일 때만 영어, 그 외에는 한국어
const initialLanguage: Language = deviceLanguage === 'en' ? 'en' : 'ko';

i18n.use(initReactI18next).init({
  resources: {
    ko: { translation: ko },
    en: { translation: en },
  },
  lng: initialLanguage,
  fallbackLng: 'ko',
  interpolation: { escapeValue: false },
});

export default i18n;
