import { Text, type TextProps, type TextStyle } from 'react-native';

import { colors, typography, type TypographyName } from '@/theme';

export interface AppTextProps extends TextProps {
  variant?: TypographyName;
  color?: string;
  align?: TextStyle['textAlign'];
}

/** SUIT 폰트와 피그마 타이포 토큰이 적용된 기본 텍스트 */
export function AppText({ variant = 'body1', color = colors.text, align, style, ...rest }: AppTextProps) {
  return <Text style={[typography[variant], { color, textAlign: align }, style]} {...rest} />;
}
