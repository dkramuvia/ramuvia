import { Text, type TextProps, type TextStyle } from 'react-native';

import { FONT_SCALE, usePreferencesStore } from '@/stores/preferencesStore';
import { useColors, typography, type TypographyName } from '@/theme';

export interface AppTextProps extends TextProps {
  variant?: TypographyName;
  color?: string;
  align?: TextStyle['textAlign'];
}

/** SUIT 폰트와 피그마 타이포 토큰이 적용된 기본 텍스트 */
export function AppText({ variant = 'body1', color, align, style, ...rest }: AppTextProps) {
  const colors = useColors();
  const fg = color ?? colors.text;
  // 설정 › 언어·지역의 글자 크기 (보완 4.14). 기기 접근성 글자 크기는 Text 가 따로 곱합니다
  const scale = FONT_SCALE[usePreferencesStore((s) => s.fontScale)] ?? 1;
  const base = typography[variant];
  const sized = scale === 1 ? null : { fontSize: base.fontSize * scale, ...(base.lineHeight ? { lineHeight: base.lineHeight * scale } : {}) };
  return <Text style={[base, sized, { color: fg, textAlign: align }, style]} {...rest} />;
}
