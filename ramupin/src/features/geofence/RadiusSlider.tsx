import { useRef, useState } from 'react';
import { PanResponder, View, type LayoutChangeEvent } from 'react-native';

import { AppText } from '@/components/ui';
import { makeStyles, useColors } from '@/theme';

const THUMB = 22;

/**
 * 안심존 반경 슬라이더 (보완 4.16: 100m ~ 1km, 50m 단위).
 * 슬라이더 라이브러리를 새로 넣으면 네이티브 빌드가 바뀌므로 손가락 위치로 직접 계산합니다.
 */
export function RadiusSlider({
  value,
  onChange,
  min = 100,
  max = 1000,
  step = 50,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const styles = useStyles();
  const colors = useColors();
  const [width, setWidth] = useState(0);
  // PanResponder 는 한 번만 만들어지므로 최신 값은 ref 로 봅니다
  const latest = useRef({ width, onChange, min, max, step });
  latest.current = { width, onChange, min, max, step };

  const fromX = (x: number) => {
    const { width: w, min: lo, max: hi, step: st } = latest.current;
    if (w <= 0) return lo;
    const ratio = Math.min(1, Math.max(0, x / w));
    return Math.round((lo + ratio * (hi - lo)) / st) * st;
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // 지도 화면 위라 손가락을 지도에 뺏기지 않게 합니다
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => latest.current.onChange(fromX(e.nativeEvent.locationX)),
      onPanResponderMove: (e) => latest.current.onChange(fromX(e.nativeEvent.locationX)),
    }),
  ).current;

  const ratio = (value - min) / (max - min);
  const label = (m: number) => (m >= 1000 ? `${m / 1000}km` : `${m}m`);

  return (
    <View style={styles.wrap}>
      <View style={styles.hit} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} {...responder.panHandlers}>
        <View style={styles.track} pointerEvents="none">
          <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
        </View>
        <View style={[styles.thumb, { left: ratio * width - THUMB / 2 }]} pointerEvents="none" />
      </View>
      <View style={styles.ends}>
        <AppText variant="caption" color={colors.textTertiary}>
          {label(min)}
        </AppText>
        <AppText variant="caption" color={colors.textTertiary}>
          {label(max)}
        </AppText>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { gap: 4 },
  hit: { height: 32, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.surfaceStrong, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: colors.brown },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.brown,
  },
  ends: { flexDirection: 'row', justifyContent: 'space-between' },
}));
