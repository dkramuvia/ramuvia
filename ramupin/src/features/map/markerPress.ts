import { useCallback, useRef } from 'react';
import { Image, View, type GestureResponderEvent } from 'react-native';

import type { MapMarkerItem } from './types';
import type { LatLng } from '@/types/models';

/** 아무 마커에도 정확히 안 들어갔을 때, 그림 가장자리에서 이만큼(dp) 벗어나도 누른 것으로 봅니다 */
const PRESS_SLOP = 4;

/** 이만큼(dp) 넘게 움직였으면 누름이 아니라 끌기입니다 */
const DRAG_DP = 10;

/**
 * **누가 눌렸는지 직접 판정합니다** (2026-10-07). 세 지도(구글·네이버·Mapbox)가 같이 씁니다.
 * 네이버·Mapbox 는 손가락이 RN 뷰로 오지 않아, 지도 탭 이벤트의 자리로 판정합니다 (resolveAt).
 *
 * 구글 지도는 마커 누름 영역을 보이는 모양보다 넓게 잡고(24dp 배지가 위아래로 25dp 쯤 더),
 * 겹치면 맨 위 마커가 이깁니다. 그래서 위에 뜬 배지가 아래 사람의 얼굴까지 덮어 **아래 사람을 누를 수
 * 없었습니다** (폰에서 확인). 게다가 마커 누름 이벤트에는 손가락 위치가 없고 마커 위치만 옵니다.
 *
 * 그래서 손가락이 닿은 자리를 받아 두고, 누름이 오면(마커든 빈 곳이든) 각 마커가 **실제로 보이는
 * 사각형** 안에 그 자리가 들어가는지 봅니다. 여러 개면 맨 위(zIndex 큰 것), 없으면 빈 곳 누름입니다.
 */
export function useMarkerPress({
  project,
  markers,
  onMapPress,
}: {
  /** 지도 좌표 → 지도 화면 위 자리(dp). 지도가 준비 안 됐으면 null */
  project: (coordinate: LatLng) => Promise<{ x: number; y: number } | null>;
  markers: MapMarkerItem[];
  onMapPress?: () => void;
}) {
  const frameRef = useRef<View>(null);
  const origin = useRef({ x: 0, y: 0 });
  const touch = useRef<{ x: number; y: number; at: number } | null>(null);
  const handledAt = useRef(0);
  const sizes = useRef(new Map<string, { width: number; height: number }>());
  const latest = useRef({ markers, onMapPress, project });
  latest.current = { markers, onMapPress, project };

  const onFrameLayout = useCallback(() => {
    frameRef.current?.measureInWindow((x, y) => {
      origin.current = { x, y };
    });
  }, []);

  const onTouchStart = useCallback((e: GestureResponderEvent) => {
    const { pageX, pageY, timestamp } = e.nativeEvent;
    touch.current = { x: pageX - origin.current.x, y: pageY - origin.current.y, at: timestamp };
  }, []);

  const setSize = useCallback((id: string, size: { width: number; height: number }) => {
    sizes.current.set(id, size);
  }, []);

  // 마커를 누르면 마커 누름과 지도 누름이 같이 옵니다. 손가락 한 번에 한 번만 판정합니다
  const resolve = useCallback(async () => {
    const t = touch.current;
    const { markers: list, onMapPress: mapPress, project: toScreen } = latest.current;
    if (!t || handledAt.current === t.at) return;
    handledAt.current = t.at;

    const pressable = list.filter((m) => m.onPress && !m.sprite);
    // 하나씩 차례로 묻습니다 — 네이버는 동시에 물으면 마지막 답만 오고 나머지는 비었습니다 (10-07 폰에서 확인)
    const points: ({ x: number; y: number } | null)[] = [];
    for (const m of pressable) points.push(await toScreen(m.coordinate).catch(() => null));
    // 보이는 모양 안에 정확히 들어간 마커를 먼저 고릅니다. 여유(PRESS_SLOP)는 아무 데도 안 들어갔을 때만 —
    // 여유를 먼저 쓰면 위에 있는 배지 가장자리가 바로 아래 사람의 얼굴을 가로챕니다 (10-07 폰에서 확인)
    const pick = (slop: number) => {
      let hit: MapMarkerItem | null = null;
      for (let i = 0; i < pressable.length; i += 1) {
        const m = pressable[i];
        const p = points[i];
        const r = p ? visibleRect(m, sizes.current.get(m.id)) : null;
        if (!p || !r) continue;
        const x = t.x - p.x;
        const y = t.y - p.y;
        const inside = x >= r.left - slop && x <= r.right + slop && y >= r.top - slop && y <= r.bottom + slop;
        if (inside && (!hit || (m.zIndex ?? 0) > (hit.zIndex ?? 0))) hit = m;
      }
      return hit;
    };
    const hit = pick(0) ?? pick(PRESS_SLOP);
    if (hit) hit.onPress?.();
    else mapPress?.();
  }, []);

  /** 탭한 자리를 지도가 알려 주는 경우 (지도 기준 dp) */
  const resolveAt = useCallback(
    (point: { x: number; y: number }) => {
      touch.current = { x: point.x, y: point.y, at: Date.now() };
      return resolve();
    },
    [resolve],
  );

  /**
   * 손가락을 뗄 때 판정 (Mapbox 마커가 직접 손가락을 받을 때). 끌어서 지도를 옮긴 것이면 누름으로 치지 않습니다
   */
  const onTouchEnd = useCallback(
    (e: GestureResponderEvent) => {
      const t = touch.current;
      if (!t) return;
      const dx = e.nativeEvent.pageX - origin.current.x - t.x;
      const dy = e.nativeEvent.pageY - origin.current.y - t.y;
      if (dx * dx + dy * dy > DRAG_DP * DRAG_DP) return;
      resolve();
    },
    [resolve],
  );

  return { frameRef, onFrameLayout, onTouchStart, onTouchEnd, setSize, resolve, resolveAt };
}

/** 좌표를 기준으로 마커가 실제로 그려지는 사각형(dp). 크기를 모르면 null */
export function visibleRect(m: MapMarkerItem, measured?: { width: number; height: number }) {
  const size = m.iconImage ? iconSizeDp(m.iconImage) : measured;
  if (!size) return null;
  const anchor = anchorFor(m, size);
  const left = -anchor.x * size.width;
  const top = -anchor.y * size.height;
  return { left, top, right: left + size.width, bottom: top + size.height };
}

/**
 * 그림 파일 마커의 화면 크기(dp). 그림은 @3x 파일이라 번들러가 알려 주는 크기가 이미 dp 입니다
 * (픽셀 ÷ 3). 기기 배율로 나누면 안 됩니다 — spriteClock 의 ASSET_SCALE 설명
 */
export function iconSizeDp(source: MapMarkerItem['iconImage']) {
  const src = Image.resolveAssetSource(source as number);
  return src ? { width: src.width, height: src.height } : null;
}

/**
 * 마커 anchor. `lift` 가 있으면 그려진 높이로 계산합니다 (핀 위 배지 — BadgeMarker 설명).
 * 1 을 넘는 값이 나오는데, 구글·네이버 지도는 그대로 받아 줍니다.
 */
export function anchorFor(m: MapMarkerItem, size: { height: number } | null | undefined) {
  if (m.lift != null && size?.height) return { x: m.anchor?.x ?? 0.5, y: 1 + m.lift / size.height };
  return m.anchor ?? { x: 0.5, y: 0.5 };
}
