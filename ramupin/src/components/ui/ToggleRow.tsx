import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { Switch } from './Switch';
import { colors, radius } from '@/theme';

interface ToggleRowProps {
  title: string;
  description?: string;
  value: boolean;
  onValueChange?: (value: boolean) => void;
  disabled?: boolean;
  /** 있으면 "친구별 상세 공유" 카드형 (색 아이콘 박스 + 반투명 카드) */
  icon?: ReactNode;
  iconBackground?: string;
}

/**
 * 제목 + 설명 + 스위치 한 줄.
 * - 아이콘 없음: 알림 설정 화면 형태 (제목 17 bold, 설명 13)
 * - 아이콘 있음: 친구별 상세 공유 카드 형태
 */
export function ToggleRow({ title, description, value, onValueChange, disabled, icon, iconBackground }: ToggleRowProps) {
  const texts = (
    <View style={styles.texts}>
      <AppText variant="headline">{title}</AppText>
      {description ? (
        <AppText variant="label2" color={colors.textSecondary}>
          {description}
        </AppText>
      ) : null}
    </View>
  );

  if (!icon) {
    return (
      <View style={styles.plainRow}>
        {texts}
        <Switch value={value} onValueChange={onValueChange} disabled={disabled} accessibilityLabel={title} />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={[styles.iconBox, { backgroundColor: iconBackground }]}>{icon}</View>
      {texts}
      <Switch value={value} onValueChange={onValueChange} disabled={disabled} accessibilityLabel={title} />
    </View>
  );
}

const styles = StyleSheet.create({
  plainRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  texts: { flex: 1, gap: 2 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    minHeight: 70,
    padding: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSoft,
  },
  iconBox: { width: 36, height: 36, borderRadius: radius.xs, alignItems: 'center', justifyContent: 'center' },
});
