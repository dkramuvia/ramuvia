import Mapbox, { Camera, CircleLayer, MapView, MarkerView, ShapeSource, LineLayer } from '@rnmapbox/maps';
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import type { MapImplHandle, MapImplProps } from './types';
import type { Preferences } from '@/stores/preferencesStore';

/**
 * 해외 지도 (WBS 4.4, 09-18 대표 결정: 유료 등급만).
 *
 * 국내에서는 쓰지 않습니다. 네이버가 장소명·로드뷰까지 훨씬 정확하고,
 * Mapbox 는 지도를 띄울 때마다 과금되기 때문입니다 (docs/map-providers.md).
 */

// 공개 토큰(pk). 비밀 토큰(sk)은 SDK 를 내려받을 때만 쓰고 앱에는 들어가지 않습니다
const ACCESS_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '';
if (ACCESS_TOKEN) Mapbox.setAccessToken(ACCESS_TOKEN);
else console.warn('[map] EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN 이 없어 해외 지도가 비어 보입니다');

/** 앱 설정의 지도 유형 → Mapbox 스타일 */
const STYLES: Record<Preferences['mapType'], string> = {
  road: Mapbox.StyleURL.Street,
  satellite: Mapbox.StyleURL.SatelliteStreet,
  terrain: Mapbox.StyleURL.Outdoors,
};

/**
 * 위도 범위(delta) → Mapbox 줌 단계.
 * 다른 지도와 같은 방식으로 확대 정도를 받기 위해 변환합니다.
 * 360도가 줌 0, 절반씩 좁아질 때마다 1씩 올라갑니다.
 */
function zoomFromDelta(delta: number): number {
  return Math.min(20, Math.max(1, Math.log2(360 / Math.max(delta, 0.0001))));
}

export const MapboxImpl = forwardRef<MapImplHandle, MapImplProps>(function MapboxImpl(
  {
    initialCenter,
    markers = [],
    circles = [],
    polylines = [],
    padding,
    onPress,
    interactive = true,
    onCenterChange,
    initialDelta,
    mapType,
    nightMode,
    style,
  },
  ref,
) {
  const camera = useRef<Camera>(null);
  // 지도가 준비되기 전에 들어온 이동 요청은 준비된 뒤 실행합니다.
  // 앱이 켜지면 친구들이 다 보이게 맞추는데(fitTo), 그 호출이 지도보다 먼저 와서 그냥 사라졌습니다
  const ready = useRef(false);
  const pending = useRef<(() => void) | null>(null);
  const run = (action: () => void) => {
    if (ready.current) action();
    else pending.current = action;
  };

  useImperativeHandle(ref, () => ({
    moveTo: (coordinate, zoomDelta = initialDelta) =>
      run(() =>
        camera.current?.setCamera({
          centerCoordinate: [coordinate.longitude, coordinate.latitude],
          zoomLevel: zoomFromDelta(zoomDelta),
          animationDuration: 400,
        }),
      ),
    fitTo: (coordinates) => {
      if (coordinates.length === 0) return;
      const lats = coordinates.map((c) => c.latitude);
      const lngs = coordinates.map((c) => c.longitude);
      run(() =>
        camera.current?.fitBounds(
          [Math.max(...lngs), Math.max(...lats)],
          [Math.min(...lngs), Math.min(...lats)],
          [80, 60, 80, 60],
          400,
        ),
      );
    },
  }));

  // 원과 선은 GeoJSON 한 덩어리로 넘깁니다. 개수가 늘어도 레이어는 그대로입니다
  const circleShape = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: circles.map((c) => ({
        type: 'Feature' as const,
        id: c.id,
        properties: { radiusM: c.radiusM, fill: c.fillColor, stroke: c.strokeColor },
        geometry: { type: 'Point' as const, coordinates: [c.center.longitude, c.center.latitude] },
      })),
    }),
    [circles],
  );

  const lineShape = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: polylines.map((p) => ({
        type: 'Feature' as const,
        id: p.id,
        properties: { color: p.color, width: p.width ?? 6 },
        geometry: { type: 'LineString' as const, coordinates: p.coordinates.map((c) => [c.longitude, c.latitude]) },
      })),
    }),
    [polylines],
  );

  return (
    <MapView
      style={style ?? StyleSheet.absoluteFill}
      styleURL={nightMode && mapType === 'road' ? Mapbox.StyleURL.Dark : STYLES[mapType]}
      scaleBarEnabled={false}
      logoEnabled
      attributionEnabled
      compassEnabled={false}
      scrollEnabled={interactive}
      zoomEnabled={interactive}
      rotateEnabled={interactive}
      pitchEnabled={interactive}
      onPress={onPress}
      onDidFinishLoadingMap={() => {
        ready.current = true;
        pending.current?.();
        pending.current = null;
      }}
      onCameraChanged={
        onCenterChange
          ? (state) => onCenterChange({ latitude: state.properties.center[1], longitude: state.properties.center[0] })
          : undefined
      }
    >
      <Camera
        ref={camera}
        defaultSettings={{
          centerCoordinate: [initialCenter.longitude, initialCenter.latitude],
          zoomLevel: zoomFromDelta(initialDelta),
        }}
        padding={
          padding
            ? {
                paddingTop: padding.top,
                paddingRight: padding.right,
                paddingBottom: padding.bottom,
                paddingLeft: padding.left,
              }
            : undefined
        }
      />

      {circles.length > 0 && (
        <ShapeSource id="ramupin-circles" shape={circleShape}>
          {/* GPS 감도 원. Mapbox 는 미터 반경 원이 없어 화면 픽셀 원으로 그립니다 */}
          <CircleLayer
            id="ramupin-circles-layer"
            style={{
              circleRadius: ['interpolate', ['exponential', 2], ['zoom'], 10, 4, 20, 40],
              circleColor: ['get', 'fill'],
              circleStrokeColor: ['get', 'stroke'],
              circleStrokeWidth: 1,
            }}
          />
        </ShapeSource>
      )}

      {polylines.length > 0 && (
        <ShapeSource id="ramupin-lines" shape={lineShape}>
          <LineLayer
            id="ramupin-lines-layer"
            style={{ lineColor: ['get', 'color'], lineWidth: ['get', 'width'], lineCap: 'round', lineJoin: 'round' }}
          />
        </ShapeSource>
      )}

      {markers.map((m) => (
        <MarkerView key={m.id} id={m.id} coordinate={[m.coordinate.longitude, m.coordinate.latitude]} anchor={{ x: 0.5, y: 0.5 }}>
          {/* MarkerView 는 자식이 하나여야 해서 감쌉니다 */}
          <View onTouchEnd={m.onPress}>{m.children}</View>
        </MarkerView>
      ))}
    </MapView>
  );
});
