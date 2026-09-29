import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { makeStyles, radius, useColors } from '@/theme';

interface ChipTabsProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** 선택 색 (기본: 파란 글자) */
  tone?: 'blue' | 'dark';
}

/** 피그마 히스토리 "전체 / 긴급·안전 / 장소·이동", 지도 설정 "라이트 / 다크" 같은 알약형 칩 */
export function ChipTabs<T extends string>({ options, value, onChange, tone = 'blue' }: ChipTabsProps<T>) {
  const styles = useStyles();
  const colors = useColors();
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
              color={tone === 'blue' ? (selected ? colors.primary : colors.textSecondary) : selected ? OVERLAY_SELECTED_TEXT : OVERLAY_TEXT}
            >
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * `tone="dark"` 는 **지도 위에 얹는 칩**입니다. 지도는 앱 테마와 따로 놀기 때문에
 * (지도 스타일을 라이트로 두면 다크 모드에서도 지도는 밝습니다) 이 칩은 테마를
 * 따라가면 안 됩니다. 다크 모드에서 흰 글자가 되어 흰 알약 위에서 안 보였습니다.
 */
const OVERLAY_BG = 'rgba(247,247,248,0.95)';
const OVERLAY_SELECTED_BG = '#2A2A2A';
const OVERLAY_TEXT = '#0C0D0E';
const OVERLAY_SELECTED_TEXT = '#FFFFFF';

const useStyles = makeStyles((colors) => ({
  row: { flexDirection: 'row', gap: 10 },
  rowDark: {
    gap: 0,
    padding: 3,
    borderRadius: radius.full,
    backgroundColor: OVERLAY_BG,
    alignSelf: 'flex-start',
  },
  chip: { alignItems: 'center', justifyContent: 'center', borderRadius: radius.full },
  chipBlue: { flex: 1, height: 36, backgroundColor: colors.surfaceStrong },
  chipDark: { height: 30, paddingHorizontal: 14 },
  chipDarkSelected: { backgroundColor: OVERLAY_SELECTED_BG },
}));
