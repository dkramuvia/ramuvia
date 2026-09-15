import type { ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { colors } from '@/theme';

interface FabProps {
  icon: ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  bottom?: number;
}

/** 피그마 "__btn-new-chat": 지름 54, 진한 갈색 원형 버튼 (화면 오른쪽 아래) */
export function Fab({ icon, onPress, accessibilityLabel, bottom = 12 }: FabProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.fab, { bottom }, pressed && styles.pressed]}
    >
      {icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 24,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.brown,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: colors.black,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  pressed: { opacity: 0.85 },
});
