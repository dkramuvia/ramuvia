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

export const fontAssets = {
  [fontFamily.regular]: require('../../assets/fonts/SUIT-Regular.ttf'),
  [fontFamily.medium]: require('../../assets/fonts/SUIT-Medium.ttf'),
  [fontFamily.semibold]: require('../../assets/fonts/SUIT-SemiBold.ttf'),
  [fontFamily.bold]: require('../../assets/fonts/SUIT-Bold.ttf'),
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
