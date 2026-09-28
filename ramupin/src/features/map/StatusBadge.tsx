import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { colors } from '@/theme';

/**
 * 지도 마커에 붙는 상태 배지 (피그마 지도 메인, 2026-09-28판).
 *
 * 예전 디자인은 이 정보를 화면 아래 고정 칩으로 보여 줬습니다. 새 디자인은
 * **마커 아래에 붙여** 누구의 상태인지 한눈에 보이게 바뀌었습니다.
 *
 * 두 가지 모양이 있습니다.
 *   - `mine` : 흰 배경 + 큰 글자. 내 이동 상태와 배터리
 *   - `friend`: 검은 배경 + 작은 글자. 친구가 한자리에 머문 시간
 */

interface StatusBadgeProps {
  text: string;
  /** 내 배지에만. 배터리 잔량(%) */
  battery?: number | null;
  tone?: 'mine' | 'friend';
}

/** 배터리가 이 아래면 빨갛게 (친구 화면의 배터리 경고와 같은 기준) */
const BATTERY_LOW = 15;

export function StatusBadge({ text, battery, tone = 'mine' }: StatusBadgeProps) {
  const mine = tone === 'mine';
  const fg = mine ? BADGE_TEXT : colors.white;

  return (
    <View style={[styles.badge, mine ? styles.mine : styles.friend]}>
      <AppText variant={mine ? 'body2Bold' : 'micro'} color={fg} numberOfLines={1}>
        {text}
      </AppText>
      {battery != null ? (
        <>
          <Ionicons
            name="battery-half"
            size={mine ? 18 : 14}
            color={battery <= BATTERY_LOW ? colors.danger : BATTERY_OK}
          />
          <AppText variant={mine ? 'body2Bold' : 'micro'} color={fg}>
            {battery}%
          </AppText>
        </>
      ) : null}
    </View>
  );
}

/** 피그마 값 그대로 (다른 곳에 없는 색이라 여기 둡니다) */
const BADGE_TEXT = '#2E3438';
const BADGE_BORDER = '#E5E5E5';
const BADGE_DARK = '#1E1E1E';
const BATTERY_OK = '#19C93C';

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BADGE_BORDER,
  },
  mine: { height: 36, paddingHorizontal: 8, backgroundColor: colors.white },
  friend: { height: 24, paddingHorizontal: 8, backgroundColor: BADGE_DARK },
});
