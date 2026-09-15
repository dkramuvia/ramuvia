import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from './AppText';
import { colors, radius, type TypographyName } from '@/theme';

/**
 * 피그마 버튼 색 조합
 * - primary: 파란 CTA (공유 상태 저장, 친구 요청하기)
 * - primaryLight: 작은 파란 버튼 (받기)
 * - dark: 진한 갈색 (팝업 확인)
 * - brown / brownLight: 갈색 CTA (친구 요청, 그룹 만들기)
 * - neutral: 회색 (비활성 "다음")
 * - white: 흰색 (거절)
 * - soft: 연보라 (중복확인)
 */
export type ButtonVariant = 'primary' | 'primaryLight' | 'dark' | 'brown' | 'brownLight' | 'neutral' | 'white' | 'soft' | 'danger';
export type ButtonSize = 'lg' | 'md' | 'sm' | 'xs';

const variantStyles: Record<ButtonVariant, { bg: string; fg: string }> = {
  primary: { bg: colors.primary, fg: colors.white },
  primaryLight: { bg: colors.primaryLight, fg: colors.textOnDark },
  dark: { bg: colors.brown, fg: colors.textOnDark },
  brown: { bg: colors.brownMedium, fg: colors.white },
  brownLight: { bg: colors.brownLight, fg: colors.white },
  neutral: { bg: colors.surfaceStrong, fg: colors.textPlaceholder },
  white: { bg: colors.white, fg: colors.text },
  soft: { bg: colors.softButton, fg: colors.softButtonText },
  // 안전 & SOS 화면의 빨간 버튼
  danger: { bg: colors.sos, fg: colors.white },
};

const sizeStyles: Record<ButtonSize, { height: number; paddingHorizontal: number; text: TypographyName }> = {
  lg: { height: 56, paddingHorizontal: 16, text: 'body1' },
  md: { height: 48, paddingHorizontal: 16, text: 'body1' },
  sm: { height: 40, paddingHorizontal: 10, text: 'label1' },
  xs: { height: 32, paddingHorizontal: 12, text: 'label2' },
};

interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** pill = 완전 둥근 모서리, rounded = 12 (온보딩 하단 CTA), square = 8 */
  shape?: 'pill' | 'rounded' | 'square';
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  shape = 'pill',
  leftIcon,
  rightIcon,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const v = variantStyles[disabled ? 'neutral' : variant];
  const s = sizeStyles[size];
  const borderRadius = shape === 'pill' ? radius.full : shape === 'rounded' ? radius.sm : radius.xs;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: v.bg, height: s.height, paddingHorizontal: s.paddingHorizontal, borderRadius },
        pressed && styles.pressed,
        style,
      ]}
      {...rest}
    >
      {leftIcon ? <View>{leftIcon}</View> : null}
      <AppText variant={s.text} color={v.fg} numberOfLines={1}>
        {label}
      </AppText>
      {rightIcon ? <View>{rightIcon}</View> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  pressed: { opacity: 0.8 },
});
