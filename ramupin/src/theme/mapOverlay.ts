import { useMemo } from 'react';
import { StyleSheet } from 'react-native';

import { usePreferencesStore } from '@/stores/preferencesStore';

/**
 * 지도 위에 얹는 것들의 색.
 *
 * **앱 화면 색과 따로 돕니다.** 설정에는 서로 다른 두 가지가 있습니다.
 *   - 앱 화면 색 (`appTheme`)  — 화면 배경·카드·글자
 *   - 지도 스타일 (`mapTheme`) — 지도 자체의 밝기
 *
 * 앱을 다크로 두고 지도는 라이트로 둘 수 있습니다. 그때 지역명·날씨·버튼이
 * `useColors()` 를 쓰면 **밝은 지도 위에 흰 글자**가 되어 사라집니다.
 * 실제로 폰에서 지역명·날씨·내 위치 버튼·로드뷰 버튼이 안 보였습니다.
 *
 * 그래서 지도 위 요소는 이 색을 씁니다. 위성 사진도 어둡게 보므로 같이 묶습니다.
 */
export interface MapOverlayColors {
  /** 지도 위 큰 글자 (지역명) */
  text: string;
  /** 지도 위 작은 글자 (날씨) */
  textSecondary: string;
  /** 반투명 알약·원형 버튼 바탕 */
  pill: string;
  /** 그 위의 글자·아이콘 */
  pillText: string;
  /** 고른 칩의 바탕 */
  pillSelected: string;
  pillSelectedText: string;
}

const overlayLight: MapOverlayColors = {
  text: '#0C0D0E',
  textSecondary: '#464D53',
  pill: 'rgba(247,247,248,0.95)',
  pillText: '#0C0D0E',
  pillSelected: '#2A2A2A',
  pillSelectedText: '#FFFFFF',
};

const overlayDark: MapOverlayColors = {
  text: '#FCFCFC',
  textSecondary: '#D8D8D8',
  pill: 'rgba(28,28,28,0.92)',
  pillText: '#F0F0F0',
  pillSelected: '#F0F0F0',
  pillSelectedText: '#101010',
};

/** 지금 지도가 어두운가 (지도 스타일 다크이거나 위성 사진) */
export function useMapIsDark(): boolean {
  const mapTheme = usePreferencesStore((s) => s.mapTheme);
  const mapType = usePreferencesStore((s) => s.mapType);
  return mapTheme === 'dark' || mapType === 'satellite';
}

export function useMapOverlay(): MapOverlayColors {
  return useMapIsDark() ? overlayDark : overlayLight;
}

/** `makeStyles` 와 같은데, 앱 화면 색이 아니라 지도 밝기를 따라갑니다 */
export function makeMapStyles<T extends StyleSheet.NamedStyles<T>>(build: (overlay: MapOverlayColors) => T): () => T {
  const cache = new Map<boolean, T>();
  return function useMapStyles(): T {
    const isDark = useMapIsDark();
    return useMemo(() => {
      const cached = cache.get(isDark);
      if (cached) return cached;
      const created = StyleSheet.create(build(isDark ? overlayDark : overlayLight));
      cache.set(isDark, created);
      return created;
    }, [isDark]);
  };
}
