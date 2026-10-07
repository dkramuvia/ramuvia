import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Image, View } from 'react-native';

import { AppText } from '@/components/ui';
import { badgeSprite, spriteSizeDp, useBadgeSlotMode, useSpriteFrame } from './spriteClock';
import type { SpriteSheet } from './spriteTypes';
import type { MovementKind } from './statusText';
import { makeStyles, useColors } from '@/theme';

/**
 * 지도 핀 위에 뜨는 상태 배지 (피그마 지도 메인, 2026-10-07).
 *
 * **크기는 모두 같습니다** (피그마 친구 배지: 24dp · 12pt). 색만 두 가지입니다.
 *   - `dark` : 검은 바탕 + 밝은 글자. 기본
 *   - `light`: 흰 바탕 + 어두운 글자. **라이트 지도에서 활성화된 사람**만
 * 다크 지도에서는 활성화된 사람도 `dark` 입니다 — 대표님 결정 2026-10-07.
 * (피그마 548·550 의 36dp 흰 배지는 쓰지 않습니다.)
 */

/**
 * 이동 수단 그림 (피그마: 의자 · 신발 · 자전거 · 자동차 · 기차 · 비행기).
 *
 * 걷기·자전거·자동차는 **피그마의 움직이는 3D 그림**을 씁니다 (spriteClock.ts `badgeSprite`).
 * 이 표는 나머지(의자·기차·비행기)와, 지도 밖에서 그릴 때 쓰는 글꼴 아이콘입니다.
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
  tone?: 'light' | 'dark';
}

/** 배터리가 이 아래면 빨갛게 (친구 화면의 배터리 경고와 같은 기준) */
const BATTERY_LOW = 15;

export function StatusBadge({ text, kind, battery, tone = 'dark' }: StatusBadgeProps) {
  const styles = useStyles();
  const colors = useColors();
  const light = tone === 'light';
  const fg = light ? BADGE_TEXT : BADGE_TEXT_ON_DARK;
  const slot = useBadgeSlotMode();
  const sprite = slot === 'icon' ? null : badgeSprite(kind);

  return (
    <View style={[styles.badge, light ? styles.light : styles.dark]}>
      {sprite ? (
        // 구운 지도에서는 칸만 비워 둡니다. 지도가 이 자리에 그림 마커를 겹칩니다 (SpriteMarker)
        slot === 'blank' ? <View style={spriteSizeDp(sprite)} /> : <LiveSprite sheet={sprite} />
      ) : (
        <MaterialCommunityIcons name={KIND_ICONS[kind]} size={15} color={fg} />
      )}
      <AppText variant="micro" color={fg} numberOfLines={1}>
        {text}
      </AppText>
      {battery != null ? (
        <>
          <Ionicons
            name="battery-half"
            size={14}
            color={battery <= BATTERY_LOW ? colors.danger : BATTERY_OK}
          />
          <AppText variant="micro" color={fg}>
            {battery}%
          </AppText>
        </>
      ) : null}
    </View>
  );
}

/** 실제 뷰로 그리는 지도(Mapbox·iOS)에서는 배지 안에서 바로 프레임을 돌립니다 (Mapbox 발자국도 이것) */
export function LiveSprite({ sheet }: { sheet: SpriteSheet }) {
  const frame = useSpriteFrame(sheet.frames.length);
  return <Image source={sheet.frames[frame]} style={spriteSizeDp(sheet)} fadeDuration={0} />;
}

/**
 * 배지 모양 수치. 구운 지도에서 그림 칸 위치를 계산할 때 씁니다 (SpriteMarker).
 * 아래 스타일과 같이 고쳐야 합니다.
 */
export const BADGE_GEOMETRY = {
  border: 1,
  paddingX: 8,
  height: 24,
} as const;

/** 피그마 값 그대로 (다른 곳에 없는 색이라 여기 둡니다) */
const BADGE_TEXT = '#2E3438';
const BADGE_TEXT_ON_DARK = '#E3E6E8';
const BADGE_BORDER = '#E5E5E5';
const BADGE_DARK = '#1E1E1E';
const BATTERY_OK = '#19C93C';

const useStyles = makeStyles((colors) => ({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: BADGE_GEOMETRY.border,
    borderColor: BADGE_BORDER,
  },
  light: { height: BADGE_GEOMETRY.height, paddingHorizontal: BADGE_GEOMETRY.paddingX, backgroundColor: colors.white },
  dark: { height: BADGE_GEOMETRY.height, paddingHorizontal: BADGE_GEOMETRY.paddingX, backgroundColor: BADGE_DARK },
}));
