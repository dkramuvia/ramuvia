import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import MapView, { Circle, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

import { DARK_MAP_STYLE } from './darkMapStyle';
import { useMarkerPress } from './markerPress';
import { MarkerRenderContext, SpriteOverlayContext, spriteSizeDp } from './spriteClock';
import { SpriteMarker } from './SpriteMarker';
import { BADGE_GEOMETRY } from './StatusBadge';
import { TrackedMarker } from './TrackedMarker';
import type { MapImplHandle, MapImplProps, MapMarkerItem } from './types';
import type { Preferences } from '@/stores/preferencesStore';

/**
 * 안드로이드 구글 지도는 마커 뷰를 그림 한 장으로 굽습니다 → 움직이는 그림은 따로 겹칩니다.
 * iOS(Apple 지도)는 뷰를 그대로 두므로 배지 안에서 바로 움직입니다.
 */
const BAKES = Platform.OS === 'android';

/** 앱 설정의 지도 유형 → Google 지도 타입 */
const MAP_TYPES: Record<Preferences['mapType'], 'standard' | 'satellite' | 'terrain'> = {
  road: 'standard',
  satellite: 'satellite',
  terrain: 'terrain',
};

/** OS 기본 지도 (Android = Google, iOS = Apple). 무료 등급 기본값 */
export const GoogleMapImpl = forwardRef<MapImplHandle, MapImplProps>(function GoogleMapImpl(
  { initialCenter, markers = [], circles = [], polylines = [], padding, onPress, interactive = true, onCenterChange, initialDelta, mapType, nightMode, style },
  ref,
) {
  const mapRef = useRef<MapView>(null);
  const press = useMarkerPress({
    project: (coordinate) => mapRef.current?.pointForCoordinate(coordinate) ?? Promise.resolve(null),
    markers,
    onMapPress: onPress,
  });
  // 지도가 준비되기 전에 들어온 이동 요청은 준비된 뒤 실행 (준비 전 호출은 무시되기 때문)
  const ready = useRef(false);
  const pending = useRef<(() => void) | null>(null);
  const run = (action: () => void) => {
    if (ready.current) action();
    else pending.current = action;
  };

  useImperativeHandle(ref, () => ({
    moveTo: (coordinate, zoomDelta = initialDelta) =>
      run(() => mapRef.current?.animateToRegion({ ...coordinate, latitudeDelta: zoomDelta, longitudeDelta: zoomDelta }, 400)),
    fitTo: (coordinates) =>
      run(() =>
        mapRef.current?.fitToCoordinates(coordinates, {
          edgePadding: { top: 80, right: 60, bottom: 80, left: 60 },
          animated: true,
        }),
      ),
  }));

  return (
    // 손가락이 닿은 자리를 받아 둡니다 — 마커 누름 이벤트에는 마커 위치만 들어 있습니다 (useMarkerPress)
    <View ref={press.frameRef} style={style ?? StyleSheet.absoluteFill} onTouchStart={press.onTouchStart} onLayout={press.onFrameLayout}>
    <MapView
      ref={mapRef}
      // Android 는 Google 지도. iOS 는 기본(Apple) 지도 — 기획 "OS별 기본 지도"
      provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
      style={StyleSheet.absoluteFill}
      initialRegion={{ ...initialCenter, latitudeDelta: initialDelta, longitudeDelta: initialDelta }}
      mapPadding={padding}
      mapType={MAP_TYPES[mapType]}
      // 위성·지형에서는 어두운 스타일이 적용되지 않습니다
      customMapStyle={nightMode && mapType === 'road' ? DARK_MAP_STYLE : undefined}
      toolbarEnabled={false}
      showsMyLocationButton={false}
      showsCompass={false}
      liteMode={!interactive && Platform.OS === 'android'}
      scrollEnabled={interactive}
      zoomEnabled={interactive}
      rotateEnabled={interactive}
      pitchEnabled={interactive}
      // 누름은 모두 직접 판정합니다 (useMarkerPress). 마커를 눌러도 지도가 그쪽으로 움직이지 않게 합니다
      onPress={press.resolve}
      onMarkerPress={press.resolve}
      moveOnMarkerPress={false}
      onMapReady={() => {
        ready.current = true;
        pending.current?.();
        pending.current = null;
      }}
      onRegionChangeComplete={onCenterChange ? (region) => onCenterChange({ latitude: region.latitude, longitude: region.longitude }) : undefined}
    >
      {circles.map((c) => (
        <Circle key={c.id} center={c.center} radius={c.radiusM} fillColor={c.fillColor} strokeColor={c.strokeColor} strokeWidth={1} />
      ))}
      {polylines.map((p) => (
        <Polyline key={p.id} coordinates={p.coordinates} strokeColor={p.color} strokeWidth={p.width ?? 6} lineCap="round" lineJoin="round" />
      ))}
      <MarkerRenderContext.Provider value={BAKES ? 'baked' : 'live'}>
        {markers.map((m) => {
          if (m.sprite) {
            return BAKES ? <SpriteMarker key={`${m.id}@${m.zIndex ?? 0}`} coordinate={m.coordinate} sheet={m.sprite.sheet} offset={m.sprite.offset} zIndex={m.zIndex} /> : null;
          }
          // 마커 자체에는 누름을 걸지 않습니다. 지도가 보내는 누름을 useMarkerPress 가 사람에게 나눠 줍니다
          const item = { ...m, onPress: undefined };
          // **zIndex 가 바뀌면 마커를 새로 만듭니다.** react-native-maps(새 아키텍처)는 zIndex 를 만들 때만
          // 읽고 나중에 바뀐 값은 지도에 넘기지 않습니다 — 활성화한 사람이 위로 안 올라왔습니다 (10-07 폰에서 확인).
          // 마커를 지우고 다시 끼우는 것은 patches/react-native-maps 패치로 안전해졌습니다
          const key = `${m.id}@${m.zIndex ?? 0}`;
          if (m.badgeSprite && BAKES) return <BadgeWithSprite key={key} item={item} onSize={press.setSize} />;
          return <TrackedMarker key={key} item={item} onContentSize={(size) => press.setSize(m.id, size)} />;
        })}
      </MarkerRenderContext.Provider>
    </MapView>
    </View>
  );
});

/**
 * 배지 + 그림 칸에 겹치는 움직이는 그림.
 *
 * 배지는 글자 길이에 따라 너비가 달라서, 그려진 너비를 재서 그림 칸 자리를 계산합니다.
 * 배지는 핀 위로 `lift` 만큼 떠 있으므로 칸의 가운데는
 *   x = -너비/2 + 테두리 + 안쪽 여백 + 그림 너비/2,  y = -(띄운 거리 + 배지 높이/2)
 */
function BadgeWithSprite({ item, onSize }: { item: MapMarkerItem; onSize: (id: string, size: { width: number; height: number }) => void }) {
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const { sheet } = item.badgeSprite!;
  const size = spriteSizeDp(sheet);
  const offset =
    box == null
      ? null
      : {
          x: -box.width / 2 + BADGE_GEOMETRY.border + BADGE_GEOMETRY.paddingX + size.width / 2,
          y: -((item.lift ?? 0) + box.height / 2),
        };
  return (
    <>
      <SpriteOverlayContext.Provider value>
        <TrackedMarker
          item={item}
          onContentSize={(size) => {
            setBox(size);
            onSize(item.id, size);
          }}
        />
      </SpriteOverlayContext.Provider>
      {offset ? (
        <SpriteMarker coordinate={item.coordinate} sheet={sheet} offset={offset} zIndex={(item.zIndex ?? 0) + 1} />
      ) : null}
    </>
  );
}
