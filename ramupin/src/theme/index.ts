export { colors } from './colors';
export { typography, fontFamily, fontAssets, type TypographyName } from './typography';

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  xs: 8,
  sm: 12,
  md: 14, // 리스트 카드
  lg: 20, // 요청 카드
  full: 999,
} as const;

/** 피그마 기준 화면 치수 (iPhone 17, 402pt) */
export const layout = {
  screenPadding: 20,
  headerHeight: 48,
  tabBarHeight: 72,
} as const;
