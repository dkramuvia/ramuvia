import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

/** 피그마 선택 표시: 선택 = 초록 원 + 체크, 미선택 = 회색 테두리 원 (20) */
export function CheckCircle({ checked, size = 22, color = colors.check }: { checked: boolean; size?: number; color?: string }) {
  if (checked) return <Ionicons name="checkmark-circle" size={size + 2} color={color} />;
  return <View style={[styles.empty, { width: size - 2, height: size - 2, borderRadius: size }]} />;
}

const styles = StyleSheet.create({
  empty: { borderWidth: 2, borderColor: colors.textMuted, margin: 2 },
});
