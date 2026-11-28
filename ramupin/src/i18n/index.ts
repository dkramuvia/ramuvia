import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import ko from './locales/ko.json';

export const SUPPORTED_LANGUAGES = ['ko', 'en'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

const deviceLanguage = getLocales()[0]?.languageCode;
// 한국어 기기만 한국어, 그 밖의 언어(일본어·스페인어 등)는 영어 (11-26 해외 출시)
const initialLanguage: Language = deviceLanguage === 'ko' ? 'ko' : 'en';

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

/** 기기 언어 (설정 › 언어·지역 "기기 설정 따름") */
export const deviceAppLanguage = (): Language => initialLanguage;
