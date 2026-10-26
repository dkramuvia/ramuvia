import { useEffect } from 'react';

import { usePreferencesStore } from '@/stores/preferencesStore';
import i18n, { deviceAppLanguage } from './index';

/**
 * 설정 › 언어·지역에서 고른 앱 언어를 적용합니다 (보완 4.14).
 * "기기 설정 따름" 이면 기기 언어, 아니면 고른 언어. 번역이 없는 글은 한국어로 보입니다.
 */
export function useAppLanguage() {
  const language = usePreferencesStore((s) => s.language);
  useEffect(() => {
    const next = language === 'auto' ? deviceAppLanguage() : language;
    if (i18n.language !== next) void i18n.changeLanguage(next);
  }, [language]);
}
