import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { colors, radius } from '@/theme';

interface CountActionBarProps {
  /** 왼쪽 진한 영역 문구 (예: 9명의 친구 등록됨) */
  label: string;
  actionLabel: string;
  onAction: () => void;
}

/** 피그마 친구 설정 / 그룹 설정 / SOS 수신인 상단: "N명의 친구 등록됨" + 연한 갈색 버튼 */
export function CountActionBar({ label, actionLabel, onAction }: CountActionBarProps) {
  return (
    <View style={styles.row}>
      <View style={styles.count}>
        <AppText variant="label1Bold" color={colors.white}>
          {label}
        </AppText>
      </View>
      <Pressable accessibilityRole="button" onPress={onAction} style={styles.action}>
        <AppText variant="label1Bold" color={colors.white}>
          {actionLabel}
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, paddingHorizontal: 6 },
  count: { flex: 1, height: 32, borderRadius: radius.xs, backgroundColor: colors.brown, alignItems: 'center', justifyContent: 'center' },
  action: { height: 32, paddingHorizontal: 12, borderRadius: radius.xs, backgroundColor: '#ACA09C', alignItems: 'center', justifyContent: 'center' },
});
