import { useCallback, useEffect, useRef } from 'react';
import type { GestureResponderEvent, LayoutChangeEvent, View } from 'react-native';

/** 이만큼(dp) 넘게 움직이면 지도를 끄는 것이라 길게 누름이 아닙니다 */
const MOVE_DP = 10;

/**
 * 지도를 손가락 하나로 오래 누르고 있으면 그 자리(dp, 지도 왼쪽 위 기준)를 알려 줍니다.
 *
 * 대표 리포트 3차: "화면에 한 지점을 3초 이상 누르면 안심존 등록".
 * 지도 세 가지 중 네이버 지도에는 길게 누름 이벤트가 없어서, 지도를 감싼 뷰에서 손가락을 직접 봅니다.
 * 응답자를 가져오지 않으므로 지도 끌기·확대는 그대로입니다 (지도 탭 두 손가락 SOS 와 같은 방식).
 */
export function useLongHold(holdMs: number, onHold: (point: { x: number; y: number }) => void) {
  const frameRef = useRef<View>(null);
  const origin = useRef({ x: 0, y: 0 });
  const start = useRef<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(onHold);
  useEffect(() => {
    latest.current = onHold;
  }, [onHold]);

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  }, []);
  useEffect(() => cancel, [cancel]);

  const onLayout = useCallback((_e: LayoutChangeEvent) => {
    frameRef.current?.measureInWindow((x, y) => {
      origin.current = { x, y };
    });
  }, []);

  const onTouchStart = useCallback(
    (e: GestureResponderEvent) => {
      cancel();
      if (e.nativeEvent.touches.length !== 1) return;
      const { pageX, pageY } = e.nativeEvent;
      start.current = { x: pageX, y: pageY };
      timer.current = setTimeout(() => {
        const s = start.current;
        cancel();
        if (s) latest.current({ x: s.x - origin.current.x, y: s.y - origin.current.y });
      }, holdMs);
    },
    [cancel, holdMs],
  );

  const onTouchMove = useCallback(
    (e: GestureResponderEvent) => {
      const s = start.current;
      if (!s) return;
      const { pageX, pageY, touches } = e.nativeEvent;
      if (touches.length !== 1 || Math.hypot(pageX - s.x, pageY - s.y) > MOVE_DP) cancel();
    },
    [cancel],
  );

  return { ref: frameRef, onLayout, onTouchStart, onTouchMove, onTouchEnd: cancel, onTouchCancel: cancel };
}
