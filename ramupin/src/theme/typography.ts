import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import type { TextStyle } from 'react-native';

/**
 * 기본 폰트: SUIT (assets/fonts, SIL OFL 라이선스)
 * Android 는 사용자 폰트에 fontWeight 를 주면 굵기가 잘 안 먹어서, 굵기마다 fontFamily 를 따로 지정합니다.
 * 이름은 app/_layout.tsx 의 useFonts 키와 같아야 합니다.
 */
export const fontFamily = {
  regular: 'SUIT-Regular',
  medium: 'SUIT-Medium',
  semibold: 'SUIT-SemiBold',
  bold: 'SUIT-Bold',
} as const;

/**
 * 앱이 시작할 때 미리 불러오는 글꼴.
 *
 * **아이콘 글꼴도 여기 있어야 합니다.** `@expo/vector-icons` 는 처음 쓸 때 글꼴을
 * 불러옵니다. 보통 화면은 글꼴이 오면 다시 그려지지만, **지도 마커는 그려지는 순간
 * 그림 한 장으로 구워져서** 글꼴을 기다려 주지 않습니다. 그래서 마커 안에 아직
 * 안 불러온 아이콘이 있으면 **마커가 통째로 안 보입니다**
 * (2026-09-29 폰에서 확인 — 배지에 새 아이콘을 넣자 마커가 사라졌습니다).
 */
export const fontAssets = {
  [fontFamily.regular]: require('../../assets/fonts/SUIT-Regular.ttf'),
  [fontFamily.medium]: require('../../assets/fonts/SUIT-Medium.ttf'),
  [fontFamily.semibold]: require('../../assets/fonts/SUIT-SemiBold.ttf'),
  [fontFamily.bold]: require('../../assets/fonts/SUIT-Bold.ttf'),
  // 지도 마커 배지에 쓰는 아이콘들 (배터리 = Ionicons, 이동 수단 = MaterialCommunityIcons)
  ...Ionicons.font,
  ...MaterialCommunityIcons.font,
};

// 피그마 SUIT 텍스트는 대부분 자간 -0.5 입니다.
const ls = -0.5;

/** 피그마에서 자주 쓰인 크기/행간/굵기 조합 (크기/행간) */
export const typography = {
  display: { fontFamily: fontFamily.bold, fontSize: 36, lineHeight: 54, letterSpacing: ls },
  title1: { fontFamily: fontFamily.bold, fontSize: 28, lineHeight: 42, letterSpacing: ls },
  title2: { fontFamily: fontFamily.bold, fontSize: 24, lineHeight: 36, letterSpacing: ls },
  title3: { fontFamily: fontFamily.bold, fontSize: 20, lineHeight: 30, letterSpacing: ls },
  title4: { fontFamily: fontFamily.bold, fontSize: 18, lineHeight: 28, letterSpacing: ls },
  headline: { fontFamily: fontFamily.bold, fontSize: 17, lineHeight: 26, letterSpacing: ls },
  headlineMedium: { fontFamily: fontFamily.medium, fontSize: 17, lineHeight: 26, letterSpacing: ls },
  body1Bold: { fontFamily: fontFamily.bold, fontSize: 16, lineHeight: 24, letterSpacing: ls },
  body1: { fontFamily: fontFamily.medium, fontSize: 16, lineHeight: 24, letterSpacing: ls },
  body1Regular: { fontFamily: fontFamily.regular, fontSize: 16, lineHeight: 24, letterSpacing: ls },
  /** 리스트 이름 (15/28 bold) */
  listTitle: { fontFamily: fontFamily.bold, fontSize: 15, lineHeight: 28, letterSpacing: ls },
  body2Bold: { fontFamily: fontFamily.bold, fontSize: 15, lineHeight: 22, letterSpacing: ls },
  body2: { fontFamily: fontFamily.medium, fontSize: 15, lineHeight: 22, letterSpacing: ls },
  label1Bold: { fontFamily: fontFamily.bold, fontSize: 14, lineHeight: 22, letterSpacing: ls },
  label1: { fontFamily: fontFamily.medium, fontSize: 14, lineHeight: 22, letterSpacing: ls },
  label2Bold: { fontFamily: fontFamily.bold, fontSize: 13, lineHeight: 20, letterSpacing: ls },
  label2: { fontFamily: fontFamily.medium, fontSize: 13, lineHeight: 20, letterSpacing: ls },
  caption: { fontFamily: fontFamily.medium, fontSize: 12, lineHeight: 18, letterSpacing: ls },
  microBold: { fontFamily: fontFamily.bold, fontSize: 11, lineHeight: 16, letterSpacing: ls },
  micro: { fontFamily: fontFamily.medium, fontSize: 11, lineHeight: 16, letterSpacing: ls },
  tab: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 16 },
} satisfies Record<string, TextStyle>;

export type TypographyName = keyof typeof typography;
