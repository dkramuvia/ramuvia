import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import type { MovementKind } from './statusText';
import { makeStyles, useColors } from '@/theme';

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

/**
 * 이동 수단 그림 (피그마: 의자 · 신발 · 자전거 · 자동차 · 기차 · 비행기).
 *
 * **디자이너 그림이 오면 이 표만 바꾸면 됩니다.** 지금은 있는 글꼴 아이콘으로 채웠습니다.
 * 피그마 것은 색이 들어간 3D 그림이라 느낌이 다릅니다.
 *
 * 그림 파일(GIF)로 받아도 여기서는 **움직이지 않습니다** — 안드로이드 지도는 마커를
 * 그림 한 장으로 구워서 올리기 때문입니다. 정지 그림으로 받는 편이 낫습니다.
 */
const KIND_ICONS: Record<MovementKind, ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  staying: 'sofa',
  walking: 'walk',
  bicycle: 'bike',
  car: 'car',
  train: 'train',
  airplane: 'airplane',
};

interface StatusBadgeProps {
  text: string;
  /** 왼쪽에 붙는 이동 수단 그림 */
  kind: MovementKind;
  /** 내 배지에만. 배터리 잔량(%) */
  battery?: number | null;
  tone?: 'mine' | 'friend';
}

/** 배터리가 이 아래면 빨갛게 (친구 화면의 배터리 경고와 같은 기준) */
const BATTERY_LOW = 15;

export function StatusBadge({ text, kind, battery, tone = 'mine' }: StatusBadgeProps) {
  const styles = useStyles();
  const colors = useColors();
  const mine = tone === 'mine';
  const fg = mine ? BADGE_TEXT : colors.white;

  return (
    <View style={[styles.badge, mine ? styles.mine : styles.friend]}>
      <MaterialCommunityIcons name={KIND_ICONS[kind]} size={mine ? 20 : 15} color={fg} />
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

const useStyles = makeStyles((colors) => ({
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
}));
