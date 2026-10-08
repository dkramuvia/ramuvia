import { useIsFocused } from 'expo-router';
import { createContext, useContext, useEffect, useState } from 'react';
import { AppState, PixelRatio } from 'react-native';

import { SPRITES } from './sprites';
import type { SpriteSheet } from './spriteTypes';
import type { MovementKind } from './statusText';

/**
 * 지도 위 움직이는 그림(자동차·자전거·운동화·발자국)의 **공용 시계**.
 *
 * GIF 를 그대로 못 쓰는 이유는 make-map-sprites.py 맨 위에 있습니다. 요약하면
 * 안드로이드 지도는 마커를 그림 한 장으로 구워서, 움직이려면 **마커 그림을 직접 바꿔 끼워야** 합니다.
 *
 * 마커마다 타이머를 두지 않고 하나로 돌립니다. 그래야 친구가 여럿이어도 타이머가 하나이고,
 * 같은 종류 그림끼리 박자가 맞습니다. 지도 탭이 안 보이거나 앱이 뒤로 가면 멈춥니다.
 */

/** 그림을 바꾸는 간격. make-map-sprites.py 의 TICK_MS 와 같아야 한 바퀴 길이가 원본과 같습니다 */
export const TICK_MS = 125;

let tick = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let foreground = AppState.currentState === 'active';
const listeners = new Set<(tick: number) => void>();

function sync() {
  const run = foreground && listeners.size > 0;
  if (run && !timer) {
    timer = setInterval(() => {
      tick += 1;
      listeners.forEach((l) => l(tick));
    }, TICK_MS);
  } else if (!run && timer) {
    clearInterval(timer);
    timer = null;
  }
}

AppState.addEventListener('change', (state) => {
  foreground = state === 'active';
  sync();
});

/** 지금 보여 줄 프레임 번호. 지도 탭이 안 보이면 멈춘 채로 둡니다 */
export function useSpriteFrame(count: number): number {
  const focused = useIsFocused();
  const [now, setNow] = useState(tick);
  useEffect(() => {
    if (!focused) return;
    listeners.add(setNow);
    sync();
    return () => {
      listeners.delete(setNow);
      sync();
    };
  }, [focused]);
  return count > 0 ? now % count : 0;
}

/** 그림이 화면에 실제로 놓이는 크기(dp). 마커 아이콘은 그림 픽셀을 그대로 씁니다 */
export function spriteSizeDp(sheet: SpriteSheet) {
  const ratio = PixelRatio.get();
  return { width: sheet.w / ratio, height: sheet.h / ratio };
}

/** 걷기 운동화 두 켤레 (분홍·파랑 / 보라). 대표님 10-08: 사람마다 랜덤 */
const WALKING = [SPRITES.walking, SPRITES.walking2];

/**
 * 사람마다 늘 같은 값이 나오는 '랜덤' (id 로 정합니다).
 * 매번 새로 뽑으면 화면을 그릴 때마다 운동화가 바뀌어 깜빡입니다.
 */
function pickFor(who: string | undefined, count: number) {
  let h = 0;
  for (const ch of who ?? '') h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h) % count;
}

/**
 * 배지 그림 칸에 들어가는 움직이는 그림 (피그마 지도 메인 548·550).
 * 의자(머무는 중)·기차·비행기는 피그마에 움직이는 그림이 없어 글꼴 아이콘 그대로입니다.
 * `who` = 사람 id. 걷기 운동화를 사람마다 고릅니다.
 */
export function badgeSprite(kind: MovementKind, who?: string): SpriteSheet | null {
  // 배지는 모두 24dp 라 작은 그림(20dp)만 씁니다
  const set =
    kind === 'car' ? SPRITES.car : kind === 'bicycle' ? SPRITES.bicycle : kind === 'walking' ? WALKING[pickFor(who, WALKING.length)] : null;
  return set ? set.sm : null;
}

/**
 * 지도가 마커 뷰를 어떻게 다루는지. 배지가 그림 칸을 어떻게 채울지 여기서 갈립니다.
 *   - `baked`: 그림 한 장으로 구움 (안드로이드 구글 지도). 칸을 비워 두고, 지도가 그 위에 그림 마커를 겹칩니다
 *   - `live` : 실제 뷰 그대로 (Mapbox · iOS). 배지 안에서 바로 움직입니다
 *   - 없음  : 지도 밖이거나 모름. 멈춘 글꼴 아이콘
 */
export type MarkerRenderMode = 'baked' | 'live';
export const MarkerRenderContext = createContext<MarkerRenderMode | null>(null);

/**
 * 구운 지도에서 이 배지 위에 **움직이는 그림 마커를 겹치는지** (GoogleMapImpl 의 BadgeWithSprite).
 * 겹치지 않는 마커(캐릭터 없는 '이름 두 글자' 마커 안의 배지)는 칸을 비우면 빈칸만 남으므로 아이콘을 그립니다.
 */
export const SpriteOverlayContext = createContext(false);

/** 배지 그림 칸을 어떻게 채울지: 비워 둠(겹칠 그림이 있음) / 안에서 움직임 / 멈춘 아이콘 */
export function useBadgeSlotMode(): 'blank' | 'live' | 'icon' {
  const mode = useContext(MarkerRenderContext);
  const overlaid = useContext(SpriteOverlayContext);
  if (mode === 'live') return 'live';
  if (mode === 'baked' && overlaid) return 'blank';
  return 'icon';
}
