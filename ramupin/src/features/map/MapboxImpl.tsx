import Mapbox, { Camera, CircleLayer, MapView, MarkerView, ShapeSource, LineLayer } from '@rnmapbox/maps';
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { useMarkerPress } from './markerPress';
import { MarkerRenderContext } from './spriteClock';
import { LiveSprite } from './StatusBadge';
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
if (!ACCESS_TOKEN) console.warn('[map] EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN 이 없어 해외 지도가 비어 보입니다');

/**
 * 토큰이 지도에 들어간 뒤에 지도를 그립니다 (AppMapView 가 기다립니다).
 * 알려진 문제: 앱이 **Mapbox 로 켜지면** 지도가 빈 화면입니다. 다른 지도에서 바꿔 들어오면 됩니다 (2026-10-07, 원인 미확인).
 */
export const mapboxReady: Promise<unknown> = ACCESS_TOKEN ? Mapbox.setAccessToken(ACCESS_TOKEN).catch(() => null) : Promise.resolve();

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
  const mapRef = useRef<MapView>(null);
  /**
   * 누가 눌렸는지는 앱이 판정합니다 (markerPress.ts — 세 지도 공통).
   * 지도 누름의 자리와 좌표 → 화면 변환(getPointInView) 모두 dp 입니다.
   */
  const press = useMarkerPress({
    project: async (c) => {
      const p = await mapRef.current?.getPointInView([c.longitude, c.latitude]);
      return p ? { x: p[0], y: p[1] } : null;
    },
    markers,
    onMapPress: onPress,
  });
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
        // 줌 0 에서 1m 가 몇 픽셀인지 (Mapbox 512px 타일 기준). 줌이 1 오를 때마다 2배 — 아래 CircleLayer
        properties: { radiusM: c.radiusM, pxPerMeterZ0: 1 / (78271.517 * Math.cos((c.center.latitude * Math.PI) / 180)), fill: c.fillColor, stroke: c.strokeColor },
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
    // 손가락 자리를 지도 기준으로 바꾸려고 지도의 화면 위치를 재 둡니다 (press.onFrameLayout)
    <View ref={press.frameRef} style={style ?? StyleSheet.absoluteFill} onLayout={press.onFrameLayout} collapsable={false}>
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      styleURL={nightMode && mapType === 'road' ? Mapbox.StyleURL.Dark : STYLES[mapType]}
      scaleBarEnabled={false}
      logoEnabled
      attributionEnabled
      compassEnabled={false}
      scrollEnabled={interactive}
      zoomEnabled={interactive}
      rotateEnabled={interactive}
      pitchEnabled={interactive}
      // 빈 곳 누름. 자리는 dp 로 옵니다 (rnmapbox 가 바꿔 줌). 마커 위 누름은 여기로 오지 않습니다 — 아래 마커가 받습니다
      onPress={(feature) => {
        const { screenPointX, screenPointY } = (feature.properties ?? {}) as { screenPointX?: number; screenPointY?: number };
        if (screenPointX == null || screenPointY == null) return onPress?.();
        press.resolveAt({ x: screenPointX, y: screenPointY });
      }}
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
          {/* GPS 감도 원. Mapbox 원은 픽셀 단위라, 줌에 따라 미터 → 픽셀로 바꿔 다른 지도처럼 실제 반경으로 그립니다 */}
          <CircleLayer
            id="ramupin-circles-layer"
            style={{
              circleRadius: [
                'interpolate',
                ['exponential', 2],
                ['zoom'],
                0,
                ['*', ['get', 'radiusM'], ['get', 'pxPerMeterZ0']],
                22,
                ['*', ['get', 'radiusM'], ['get', 'pxPerMeterZ0'], 2 ** 22],
              ],
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

      {/* Mapbox 마커는 실제 뷰라서 배지 안의 움직이는 그림이 그대로 돕니다 */}
      <MarkerRenderContext.Provider value="live">
        {[...markers]
          // 겹칠 때 위아래 순서: Mapbox 마커는 zIndex 가 없고 나중에 그린 것이 위에 옵니다.
          // 순서가 바뀌면 key 도 바꿔 새로 붙여야 실제로 순서가 바뀝니다
          .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
          .map((m) => {
            const key = `${m.id}@${m.zIndex ?? 0}`;
            if (m.sprite) {
              // 움직이는 그림(발자국): 좌표에 가운데를 두고 offset 만큼 옮겨 그립니다. 누르지 않습니다
              const { x, y } = m.sprite.offset;
              return (
                <MarkerView key={key} id={key} coordinate={[m.coordinate.longitude, m.coordinate.latitude]} anchor={{ x: 0.5, y: 0.5 }} allowOverlap>
                  <View pointerEvents="none" style={{ transform: [{ translateX: x }, { translateY: y }] }}>
                    <LiveSprite sheet={m.sprite.sheet} />
                  </View>
                </MarkerView>
              );
            }
            return (
              <MarkerView
                key={key}
                id={key}
                coordinate={[m.coordinate.longitude, m.coordinate.latitude]}
                // Mapbox 는 0~1 을 넘는 anchor 를 받지 않습니다. 띄울 거리(lift)는 아래 여백으로 줍니다 —
                // Mapbox 마커는 실제 뷰라 구글 지도처럼 여백이 빠지는 일이 없습니다
                anchor={m.lift != null ? { x: m.anchor?.x ?? 0.5, y: 1 } : (m.anchor ?? { x: 0.5, y: 0.5 })}
                // 겹쳐도 숨기지 않습니다 (기본값은 겹치면 하나만 보여 줌)
                allowOverlap
              >
                {/*
                  Mapbox 는 **마커 위를 누르면 지도 누름을 보내지 않습니다** (rnmapbox isPointOnMarkerView).
                  그래서 마커가 손가락을 받아, 누른 자리를 공용 판정에 넘깁니다 — 겹친 아래 사람·여백 아래 핀도 판정이 고릅니다
                */}
                <View
                  style={m.lift != null ? { paddingBottom: m.lift } : undefined}
                  onTouchStart={press.onTouchStart}
                  onTouchEnd={press.onTouchEnd}
                >
                  {/* 판정에 쓸 크기는 여백을 뺀 내용만 */}
                  <View onLayout={(e) => press.setSize(m.id, { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
                    {m.children ?? (m.iconImage ? <IconImage source={m.iconImage} /> : null)}
                  </View>
                </View>
              </MarkerView>
            );
          })}
      </MarkerRenderContext.Provider>
    </MapView>
    </View>
  );
});

/**
 * 그림 파일 마커(캐릭터 핀). 구글 지도처럼 그림 픽셀 그대로의 크기로 놓습니다 —
 * 그림은 3배 화면 기준 픽셀로 만들어 두었습니다 (make-marker-avatars.mjs).
 */
function IconImage({ source }: { source: NonNullable<MapImplProps['markers']>[number]['iconImage'] }) {
  // @3x 그림이라 번들러가 주는 크기가 이미 dp 입니다 (markerPress.iconSizeDp 설명)
  const size = Image.resolveAssetSource(source as number);
  return <Image source={source} style={{ width: size.width, height: size.height }} fadeDuration={0} />;
}
