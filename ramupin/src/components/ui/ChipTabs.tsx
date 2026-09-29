import { Pressable, View } from 'react-native';

import { AppText } from './AppText';
import { makeMapStyles, makeStyles, radius, useColors, useMapOverlay } from '@/theme';

interface ChipTabsProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** 선택 색 (기본: 파란 글자) */
  tone?: 'blue' | 'dark';
}

/**
 * 피그마 히스토리 "전체 / 긴급·안전 / 장소·이동", 지도 설정 "라이트 / 다크" 같은 알약형 칩.
 *
 * 두 가지가 색을 다르게 가져옵니다.
 *   - `tone="blue"` 는 화면 안에 있어 **앱 화면 색**을 따라갑니다
 *   - `tone="dark"` 는 **지도 위**에 얹혀서 **지도 밝기**를 따라갑니다
 *
 * 앱만 다크로 두고 지도를 라이트로 두면, 지도 위 칩이 흰 알약에 흰 글자가 되어
 * 안 보였습니다. 그래서 스타일도 두 벌로 나눠 둡니다.
 */
export function ChipTabs<T extends string>({ options, value, onChange, tone = 'blue' }: ChipTabsProps<T>) {
  const styles = useStyles();
  const overlayStyles = useOverlayStyles();
  const colors = useColors();
  const overlay = useMapOverlay();
  return (
    <View style={[styles.row, tone === 'dark' && overlayStyles.rowDark]} accessibilityRole="tablist">
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
              tone === 'dark' && selected && overlayStyles.chipDarkSelected,
            ]}
          >
            <AppText
              variant={tone === 'blue' ? 'body2Bold' : 'label2'}
              color={
                tone === 'blue'
                  ? selected
                    ? colors.primary
                    : colors.textSecondary
                  : selected
                    ? overlay.pillSelectedText
                    : overlay.pillText
              }
            >
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  row: { flexDirection: 'row', gap: 10 },
  chip: { alignItems: 'center', justifyContent: 'center', borderRadius: radius.full },
  chipBlue: { flex: 1, height: 36, backgroundColor: colors.surfaceStrong },
  chipDark: { height: 30, paddingHorizontal: 14 },
}));

const useOverlayStyles = makeMapStyles((overlay) => ({
  rowDark: {
    gap: 0,
    padding: 3,
    borderRadius: radius.full,
    backgroundColor: overlay.pill,
    alignSelf: 'flex-start',
  },
  chipDarkSelected: { backgroundColor: overlay.pillSelected },
}));
