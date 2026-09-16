import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Platform, StyleSheet } from 'react-native';
import MapView, { Circle, Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

import { DARK_MAP_STYLE } from './darkMapStyle';
import type { MapImplHandle, MapImplProps } from './types';
import type { Preferences } from '@/stores/preferencesStore';

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
    <MapView
      ref={mapRef}
      // Android 는 Google 지도. iOS 는 기본(Apple) 지도 — 기획 "OS별 기본 지도"
      provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
      style={style ?? StyleSheet.absoluteFill}
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
      onPress={onPress}
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
      {markers.map((m) => (
        <Marker key={m.id} coordinate={m.coordinate} anchor={{ x: 0.5, y: 0.5 }} onPress={m.onPress} zIndex={m.zIndex}>
          {m.children}
        </Marker>
      ))}
    </MapView>
  );
});
