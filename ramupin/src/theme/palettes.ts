import { colors as light } from './colors';

/**
 * 라이트·다크 두 벌의 색 (피그마 2026-09-28 `dark mode (prototyping)` 페이지).
 *
 * **왜 지금 나누나**: 다크 모드는 화면 몇 개를 고치는 일이 아니라 색을 쓰는 방식 자체를
 * 바꾸는 일입니다. `colors` 를 쓰는 파일이 98개라, 나중에 하면 그만큼 다시 만져야 합니다.
 *
 * **아직 하지 않은 것**: 다크 값은 피그마에서 아직 뽑지 못했습니다 (피그마가 속도 제한).
 * 지금 값은 라이트를 뒤집은 **임시값**이고, 피그마 값이 들어오면 이 파일만 고치면 됩니다.
 * 화면 코드는 건드릴 필요가 없습니다 — 그게 이렇게 나누는 이유입니다.
 */

/**
 * 색 이름은 라이트와 같고, 값은 그냥 색 문자열입니다.
 * `colors.ts` 는 `as const` 라 값까지 타입으로 고정되는데, 그대로 쓰면 다크에서
 * 다른 값을 넣을 수 없습니다 ("#121212 는 #F7F7F8 이 아니다" 라는 오류가 납니다).
 */
export type Palette = { [K in keyof typeof light]: string };
export type ThemeName = 'light' | 'dark';

/**
 * 다크 팔레트.
 *
 * 라이트와 **같은 이름**을 씁니다. 화면은 `colors.text` 라고만 쓰고, 어느 쪽인지는
 * 신경 쓰지 않습니다. 이름이 달라지면 화면마다 분기가 생겨 감당이 안 됩니다.
 */
const dark: Palette = {
  ...light,

  white: '#FFFFFF',
  black: '#000000',

  // 배경 — 피그마 다크 화면의 밑색
  background: '#121212',
  backgroundWarm: '#1A1A1A',
  surface: '#1E1E1E',
  surfaceStrong: '#252525',
  surfaceSoft: '#2525258A',
  popup: '#1E1E1E',

  // 글자 — 라이트의 반대 방향으로. 순백은 눈이 부셔 쓰지 않습니다
  text: '#E3E6E8',
  textStrong: '#F7F7F8',
  textTitle: '#F7F7F8',
  textSecondary: '#C7CDD1',
  textTertiary: '#ACB3B9',
  textPlaceholder: '#74818B',
  textMuted: '#6D6E6E',
  textLabel: '#9AA0AA',
  textOnDark: '#F7F7F8',

  // 선
  border: '#3D3D3E',
  borderLight: '#2E3438',
  divider: '#2E3438',

  // 브랜드는 어두운 배경에서도 그대로 씁니다 (식별용 색이라 바뀌면 안 됩니다)
  brown: '#5B4F4B',
  brownMedium: '#6B5D58',
  brownLight: '#7C6D67',

  // 아바타
  avatarBackground: '#2E3438',
  avatarText: '#ACB3B9',

  // 하단 탭
  tabBar: '#1A1A1A',
  tabBarBorder: '#252525',
  tabInactive: '#6D6E6E',
};

export const palettes: Record<ThemeName, Palette> = { light, dark };
