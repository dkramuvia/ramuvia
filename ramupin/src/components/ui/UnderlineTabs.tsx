import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { colors } from '@/theme';

interface UnderlineTabsProps<T extends string> {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * 피그마 친구 요청 화면 "받은 요청 ② / 보낸 요청 (4)" 탭.
 * 선택된 탭: 파란 글자 + 숫자 배지 + 파란 밑줄, 비선택: 회색 글자 + (숫자)
 */
export function UnderlineTabs<T extends string>({ options, value, onChange }: UnderlineTabsProps<T>) {
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={styles.item}
          >
            <View style={styles.labelRow}>
              <AppText variant="label1" color={selected ? colors.primary : colors.avatarText}>
                {selected || option.count == null ? option.label : `${option.label} (${option.count})`}
              </AppText>
              {selected && option.count != null ? (
                <View style={styles.badge}>
                  <AppText variant="label1" color={colors.popup}>
                    {option.count}
                  </AppText>
                </View>
              ) : null}
            </View>
            <View style={[styles.underline, selected && styles.underlineSelected]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  item: { flex: 1, alignItems: 'center', paddingTop: 8 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 32 },
  badge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 6,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  underline: { alignSelf: 'stretch', height: 2, marginTop: 4 },
  underlineSelected: { backgroundColor: colors.primarySoft },
});
