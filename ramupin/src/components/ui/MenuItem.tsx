import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { colors, radius } from '@/theme';

interface MenuItemProps {
  label: string;
  onPress: () => void;
  /**
   * card: 설정 메뉴처럼 회색 카드 (높이 46)
   * plain: 그룹 설정처럼 아이콘 + 글자 + 오른쪽 화살표
   */
  variant?: 'card' | 'plain';
  icon?: ReactNode;
  color?: string;
}

export function MenuItem({ label, onPress, variant = 'card', icon, color = colors.text }: MenuItemProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [variant === 'card' ? styles.card : styles.plain, pressed && styles.pressed]}
    >
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <AppText variant={variant === 'card' ? 'listTitle' : 'body2Bold'} color={color} style={styles.label}>
        {label}
      </AppText>
      {variant === 'plain' ? <Ionicons name="chevron-forward" size={22} color={colors.text} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingLeft: 20,
    paddingRight: 8,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  plain: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  icon: { width: 24, alignItems: 'center' },
  label: { flex: 1 },
  pressed: { opacity: 0.7 },
});
