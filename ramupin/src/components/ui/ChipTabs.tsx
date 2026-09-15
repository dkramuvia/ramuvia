import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { colors, radius } from '@/theme';

interface ChipTabsProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** 선택 색 (기본: 파란 글자) */
  tone?: 'blue' | 'dark';
}

/** 피그마 히스토리 "전체 / 긴급·안전 / 장소·이동", 지도 설정 "라이트 / 다크" 같은 알약형 칩 */
export function ChipTabs<T extends string>({ options, value, onChange, tone = 'blue' }: ChipTabsProps<T>) {
  return (
    <View style={[styles.row, tone === 'dark' && styles.rowDark]} accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[
              styles.chip,
              tone === 'blue' ? styles.chipBlue : styles.chipDark,
              tone === 'dark' && selected && styles.chipDarkSelected,
            ]}
          >
            <AppText
              variant={tone === 'blue' ? 'body2Bold' : 'label2'}
              color={tone === 'blue' ? (selected ? colors.primary : colors.textSecondary) : selected ? colors.white : colors.textStrong}
            >
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  rowDark: {
    gap: 0,
    padding: 3,
    borderRadius: radius.full,
    backgroundColor: 'rgba(247,247,248,0.95)',
    alignSelf: 'flex-start',
  },
  chip: { alignItems: 'center', justifyContent: 'center', borderRadius: radius.full },
  chipBlue: { flex: 1, height: 36, backgroundColor: colors.surfaceStrong },
  chipDark: { height: 30, paddingHorizontal: 14 },
  chipDarkSelected: { backgroundColor: '#2A2A2A' },
});
