import { useMemo } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';

import { usePreferencesStore } from '@/stores/preferencesStore';
import { palettes, type Palette, type ThemeName } from './palettes';

/**
 * 지금 쓸 색 (피그마 2026-09-28 다크 모드).
 *
 * **어떻게 바뀌나**: 기본은 **기기 설정을 따라갑니다.** 안드로이드에서 다크 모드를 켜면
 * 앱도 같이 어두워집니다. 설정에서 직접 고를 수도 있게 해 두었습니다 (auto / light / dark).
 *
 * **왜 스타일을 함수로 만드나**: `StyleSheet.create` 를 파일 맨 아래에 두면 앱이 뜰 때
 * 한 번만 계산돼서, 나중에 테마가 바뀌어도 그 색 그대로 남습니다. 그래서 색이 들어가는
 * 스타일은 화면이 그려질 때마다 만들어야 합니다.
 *
 * 쓰는 법:
 * ```tsx
 * const useStyles = makeStyles((colors) => ({ box: { backgroundColor: colors.surface } }));
 *
 * function Screen() {
 *   const styles = useStyles();
 *   const colors = useColors();
 *   ...
 * }
 * ```
 */

export function useThemeName(): ThemeName {
  const system = useColorScheme();
  const preferred = usePreferencesStore((s) => s.appTheme);
  if (preferred === 'light' || preferred === 'dark') return preferred;
  return system === 'dark' ? 'dark' : 'light';
}

export function useColors(): Palette {
  return palettes[useThemeName()];
}

/**
 * 색이 들어가는 스타일을 테마에 맞춰 만듭니다.
 * 테마가 바뀔 때만 다시 계산합니다 (그리기마다 만들면 낭비입니다).
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(build: (colors: Palette) => T): () => T {
  const cache = new Map<ThemeName, T>();
  return function useStyles(): T {
    const name = useThemeName();
    return useMemo(() => {
      const cached = cache.get(name);
      if (cached) return cached;
      const created = StyleSheet.create(build(palettes[name]));
      cache.set(name, created);
      return created;
    }, [name]);
  };
}
