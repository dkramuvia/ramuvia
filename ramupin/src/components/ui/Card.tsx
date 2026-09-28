import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, useColors } from '@/theme';

interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  background?: string;
}

/** 피그마 "Attachment Card Horizontal - Nova": 배경 #EFF0F2(라이트) / #1E1E1E(다크), 모서리 14 */
export function Card({ children, onPress, style, background }: CardProps) {
  const colors = useColors();
  const bg = background ?? colors.surface;

  if (!onPress) return <View style={[styles.card, { backgroundColor: bg }, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, { backgroundColor: bg }, pressed && styles.pressed, style]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.md },
  pressed: { opacity: 0.7 },
});
