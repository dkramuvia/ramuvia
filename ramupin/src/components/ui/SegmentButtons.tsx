import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { colors, radius } from '@/theme';

interface SegmentButtonsProps<T extends string> {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
}

/** 피그마 성별 선택 "남성 / 여성": 나란한 알약 버튼 2개, 선택 = 파랑 (높이 48) */
export function SegmentButtons<T extends string>({ options, value, onChange }: SegmentButtonsProps<T>) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.item, selected && styles.itemSelected]}
          >
            <AppText variant="body1Regular" color={selected ? colors.white : colors.textTertiary}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  item: { flex: 1, height: 48, borderRadius: radius.full, backgroundColor: colors.surfaceStrong, alignItems: 'center', justifyContent: 'center' },
  itemSelected: { backgroundColor: colors.primary },
});
