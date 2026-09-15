import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { colors, type TypographyName } from '@/theme';

interface BatteryBadgeProps {
  level: number; // 0~100
  /** 20 = 친구 리스트, 12 = 프로필 카드 */
  iconSize?: number;
  textVariant?: TypographyName;
  textColor?: string;
  showLabel?: boolean;
}

// TODO(정책): 배터리 부족 기준값은 서버 정책에서 받기 (WBS 8.9 기본 10%)
const LOW_LEVEL = 15;

/** 세로 배터리 아이콘 + 퍼센트 */
export function BatteryBadge({
  level,
  iconSize = 20,
  textVariant = 'microBold',
  textColor = colors.textStrong,
  showLabel = true,
}: BatteryBadgeProps) {
  const clamped = Math.max(0, Math.min(100, level));
  const bodyW = iconSize * 0.45;
  const bodyH = iconSize * 0.72;
  const fillColor = clamped <= LOW_LEVEL ? colors.batteryLow : colors.battery;

  return (
    <View style={styles.row}>
      <View style={{ width: iconSize, height: iconSize, alignItems: 'center', justifyContent: 'center' }}>
        <View style={[styles.cap, { width: bodyW * 0.45, height: iconSize * 0.07 }]} />
        <View style={[styles.body, { width: bodyW, height: bodyH, borderRadius: iconSize * 0.1 }]}>
          <View style={{ height: `${clamped}%`, backgroundColor: fillColor, borderRadius: 1 }} />
        </View>
      </View>
      {showLabel ? (
        <AppText variant={textVariant} color={textColor}>
          {clamped}%
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  cap: { backgroundColor: colors.textStrong, borderTopLeftRadius: 1, borderTopRightRadius: 1 },
  body: {
    borderWidth: 1.4,
    borderColor: colors.textStrong,
    padding: 1.2,
    justifyContent: 'flex-end',
  },
});
