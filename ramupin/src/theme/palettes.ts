import { colors as light } from './colors';

/**
 * 라이트·다크 두 벌의 색 (피그마 2026-09-28 `dark mode (prototyping)` 페이지).
 *
 * **왜 지금 나누나**: 다크 모드는 화면 몇 개를 고치는 일이 아니라 색을 쓰는 방식 자체를
 * 바꾸는 일입니다. `colors` 를 쓰는 파일이 98개라, 나중에 하면 그만큼 다시 만져야 합니다.
 *
 * **다크 값은 어디서 왔나**: 피그마 다크 페이지를 그림으로 받아(파일 조회가 속도 제한에
 * 걸려 있었습니다) 픽셀에서 많이 쓰인 색을 세어 뽑았습니다 (`scripts/sample-colors.mjs`).
 * 배경·카드처럼 넓게 칠한 색은 이 방법으로도 정확합니다. 실제로 나온 비율은
 * #1C1C1C 15%, #0C0C0C 12%, #101010 9%, #303030 7% 였습니다.
 *
 * 글자·선처럼 가는 것은 그림에서 흐려져 정확하지 않을 수 있습니다.
 * 피그마 조회가 풀리면 그 값으로 한 번 맞춰 보는 것이 좋습니다.
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

  // 배경 — 그림에서 가장 많이 나온 순서대로
  background: '#101010', // 화면 밑색
  backgroundWarm: '#0C0C0C', // 가입·온보딩 (더 어둡게)
  surface: '#1C1C1C', // 카드·설정 메뉴
  surfaceStrong: '#303030', // 세그먼트 트랙, 비활성 버튼
  surfaceSoft: '#30303066',
  popup: '#242424',
  card: '#1C1C1C', // 라이트의 흰 카드·입력칸 자리
  inputBackground: '#1C1C1C',
  // 상대 말풍선이 #1C1C1C 라, 내 말풍선은 그보다 한 단계 밝게 해야 구분됩니다
  chatBubbleMine: '#3A3A3A',
  chatBackground: '#0E1418', // 라이트의 연한 하늘을 어둡게 (파랑기만 남김)

  // 글자 — 그림에서 나온 밝은 색 기준. 순백(#FFFFFF)은 눈이 부셔 쓰지 않습니다
  text: '#F0F0F0',
  textStrong: '#FCFCFC',
  textTitle: '#FCFCFC',
  textSecondary: '#D8D8D8',
  textTertiary: '#ACB3B9',
  textPlaceholder: '#74818B',
  textMuted: '#6D6E6E',
  textLabel: '#9AA0AA',
  textOnDark: '#F4F4F8',

  // 선 — 어두운 배경에서는 선을 밝게 하는 대신 **더 밝은 면**으로 구분합니다.
  // 라이트처럼 진한 선을 쓰면 어두운 바탕에서 보이지 않습니다
  border: '#3C3C3C',
  borderLight: '#282828',
  divider: '#282828',

  // 브랜드는 어두운 배경에서도 그대로 씁니다 (식별용 색이라 바뀌면 안 됩니다)
  brown: '#5B4F4B',
  brownMedium: '#6B5D58',
  brownLight: '#7C6D67',

  // 아바타
  avatarBackground: '#2C2C2C',
  avatarText: '#ACB3B9',

  // 하단 탭
  tabBar: '#181818',
  tabBarBorder: '#242424',
  tabInactive: '#6D6E6E',
};

export const palettes: Record<ThemeName, Palette> = { light, dark };
