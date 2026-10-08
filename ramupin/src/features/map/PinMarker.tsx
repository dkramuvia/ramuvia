import { useEffect } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/ui';
import { fontFamily, makeStyles } from '@/theme';
import { useMarkerReady } from './markerReady';
import { markerAvatarSource } from './markerAvatars';
import type { MapMarkerItem } from './types';

/**
 * 지도 위 사람 마커 = **핀** (피그마 `Component 20`, 2026-10-07).
 *
 *   - 캐릭터가 있으면 캐릭터 핀 (그림 파일 — scripts/make-marker-avatars.mjs)
 *   - 없으면(올린 사진·미설정) 검은 원 안에 **이름 5자까지** (속성 1=5글자 / 3글자)
 *
 * 40dp 원 아래로 뾰족한 꼬리가 붙어 전체 40×52dp 이고, **꼬리 끝이 위치 좌표**입니다.
 * 상태 배지는 핀 위로 12dp 띄워 따로 겁니다 (BadgeMarker).
 */
export const PIN = {
  width: 40,
  height: 52,
  /** 핀 꼭대기와 배지 아래쪽 사이 (피그마 지도 메인 550) */
  badgeGap: 12,
} as const;

/** 꼬리 끝을 좌표에 맞춥니다 */
export const PIN_ANCHOR = { x: 0.5, y: 1 } as const;

/** 이름 핀에 넣는 글자 수. 한글 기준 5자가 원 안에 들어갑니다 */
const NAME_MAX = 5;

/**
 * 사람 마커에 필요한 칸을 채워 줍니다 (지도 메인 · 친구 동선 화면 공통).
 * 캐릭터는 그림 파일로 올립니다 — 뷰로 구우면 그림이 빠집니다 (markerAvatars.ts).
 */
export function personPin({
  name,
  avatarUrl,
  active,
}: {
  name: string;
  avatarUrl?: string | null;
  /** 활성화된 사람: 파란 테두리 (지도 메인에서 누른 사람, 동선 화면의 주인공) */
  active?: boolean;
}): Pick<MapMarkerItem, 'iconImage' | 'children' | 'anchor' | 'trackKey'> {
  const 캐릭터 = markerAvatarSource(avatarUrl ?? undefined, !!active);
  return {
    iconImage: 캐릭터,
    anchor: PIN_ANCHOR,
    trackKey: `${avatarUrl ?? ''}|${name}|${active ? 'active' : ''}`,
    children: 캐릭터 ? null : <NamePin name={name} active={active} />,
  };
}

/** 캐릭터 없는 사람: 검은 원 + 이름 (속성 1=5글자) */
export function NamePin({ name, active }: { name: string; active?: boolean }) {
  const styles = useStyles();
  const markerReady = useMarkerReady();
  // 그림이 없어 기다릴 것이 없습니다. 알리지 않으면 4초 동안 계속 다시 굽습니다 (TrackedMarker)
  useEffect(() => {
    markerReady();
  }, [markerReady]);

  // 글자 단위로 자릅니다 (한글·이모지가 반쪽 나지 않게)
  const 이름 = Array.from(name.trim()).slice(0, NAME_MAX).join('');
  const fontSize = nameFontSize(이름);
  return (
    <View style={styles.pin} collapsable={false}>
      <View style={styles.tail} />
      <View style={[styles.circle, active && styles.circleActive]}>
        <AppText style={[styles.name, { fontSize, lineHeight: Math.ceil(fontSize * 1.25) }]} numberOfLines={1} allowFontScaling={false}>
          {이름}
        </AppText>
      </View>
    </View>
  );
}

/**
 * 원 안 글자 크기. **글자 수에 맞춰** 원 안을 채웁니다 (대표님 10-08: 5자까지, 폰트는 맞춰서).
 * 한글 한 글자 폭을 0.9, 영문·숫자를 0.55 로 쳐서 (피그마: 6.8 크기 5자 = 30dp) 원 안 폭(NAME_WIDTH)에 들어가는 크기를 고릅니다.
 * 한글 5자면 피그마 값(6.8)과 거의 같고, 짧을수록 커집니다 (최대 NAME_MAX_FONT).
 */
const NAME_WIDTH = 31;
const NAME_MAX_FONT = 14;
/** 한글(자모·완성형)·한자 — 영문보다 넓은 글자 */
const WIDE_CHAR = /[ᄀ-ᇿ㄰-㆏가-힯一-鿿]/;
function nameFontSize(name: string) {
  const units = Array.from(name).reduce((sum, ch) => sum + (WIDE_CHAR.test(ch) ? 0.9 : 0.55), 0);
  return Math.min(NAME_MAX_FONT, Math.floor((NAME_WIDTH / Math.max(units, 1)) * 10) / 10);
}

/** 피그마 값 그대로 (다른 곳에 없는 색이라 여기 둡니다) */
const PIN_LINE = '#E5E5E5';
const PIN_FILL = '#1E1E1E';

const useStyles = makeStyles((colors) => ({
  pin: { width: PIN.width, height: PIN.height, alignItems: 'center' },
  circle: {
    width: PIN.width,
    height: PIN.width,
    borderRadius: PIN.width / 2,
    borderWidth: 1,
    borderColor: PIN_LINE,
    backgroundColor: PIN_FILL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleActive: { borderWidth: 2, borderColor: colors.primary },
  // 위가 넓고 아래가 뾰족한 삼각형 (12×16dp, 원 아래쪽 4dp 와 겹침)
  tail: {
    position: 'absolute',
    top: 36,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 16,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: PIN_LINE,
  },
  // 피그마 SUIT Medium. 크기는 글자 수에 따라 (nameFontSize)
  name: { fontFamily: fontFamily.medium, color: colors.white, includeFontPadding: false, textAlign: 'center' },
}));
