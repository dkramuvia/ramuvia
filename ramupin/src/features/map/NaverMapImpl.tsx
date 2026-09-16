import { NaverMapCircleOverlay, NaverMapMarkerOverlay, NaverMapPathOverlay, NaverMapView, type NaverMapViewRef } from '@mj-studio/react-native-naver-map';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import type { MapImplProps, MapImplHandle } from './types';
import type { Preferences } from '@/stores/preferencesStore';
import { colors } from '@/theme';

/** 앱 설정의 지도 유형 → 네이버 지도 타입 */
const MAP_TYPES: Record<Preferences['mapType'], 'Basic' | 'Satellite' | 'Terrain'> = {
  road: 'Basic',
  satellite: 'Satellite',
  terrain: 'Terrain',
};

/** 위도 범위(delta) → 줌 레벨. delta 가 작을수록 확대 */
const zoomOf = (delta: number) => Math.min(21, Math.max(4, Math.log2(360 / delta) - 1));

/** 마커 원 크기 (이름은 원 아래에 표시). 네이버 지도 글자와 겹치지 않도록 작게 */
const DEFAULT_MARKER_SIZE = 18;

/**
 * 네이버 지도 (유료 등급 전용, WBS 4.4·10.5).
 * 화면은 AppMapView 만 사용하고, 네이버 SDK 는 이 파일에서만 다룹니다.
 */
export const NaverMapImpl = forwardRef<MapImplHandle, MapImplProps>(function NaverMapImpl(
  { initialCenter, markers = [], circles = [], polylines = [], padding, onPress, interactive = true, onCenterChange, initialDelta, mapType, nightMode, style },
  ref,
) {
  const mapRef = useRef<NaverMapViewRef>(null);

  useImperativeHandle(ref, () => ({
    moveTo: (coordinate, zoomDelta) => mapRef.current?.animateCameraTo({ ...coordinate, zoom: zoomOf(zoomDelta ?? initialDelta), duration: 400 }),
    fitTo: (coordinates) => {
      if (coordinates.length === 0) return;
      const lats = coordinates.map((c) => c.latitude);
      const lngs = coordinates.map((c) => c.longitude);
      mapRef.current?.animateRegionTo({
        latitude: Math.min(...lats),
        longitude: Math.min(...lngs),
        latitudeDelta: Math.max(0.002, Math.max(...lats) - Math.min(...lats)),
        longitudeDelta: Math.max(0.002, Math.max(...lngs) - Math.min(...lngs)),
        duration: 400,
      });
    },
  }));

  return (
    <NaverMapView
      ref={mapRef}
      style={style ?? StyleSheet.absoluteFill}
      initialCamera={{ ...initialCenter, zoom: zoomOf(initialDelta) }}
      mapType={MAP_TYPES[mapType]}
      // 바텀시트·광고 등에 가려지는 만큼 지도 안쪽 여백
      mapPadding={padding}
      isNightModeEnabled={nightMode}
      isShowScaleBar={false}
      isShowZoomControls={false}
      isShowLocationButton={false}
      isScrollGesturesEnabled={interactive}
      isZoomGesturesEnabled={interactive}
      isRotateGesturesEnabled={interactive}
      isTiltGesturesEnabled={interactive}
      onTapMap={onPress}
      onCameraChanged={onCenterChange ? (e) => onCenterChange({ latitude: e.latitude, longitude: e.longitude }) : undefined}
    >
      {circles.map((c) => (
        <NaverMapCircleOverlay
          key={c.id}
          latitude={c.center.latitude}
          longitude={c.center.longitude}
          radius={c.radiusM}
          color={c.fillColor}
          outlineColor={c.strokeColor}
          outlineWidth={1}
        />
      ))}
      {polylines.map((p) => (
        <NaverMapPathOverlay key={p.id} coords={p.coordinates} width={p.width ?? 6} color={p.color} outlineWidth={0} />
      ))}
      {/* TODO(디자인): 프로필 사진 마커. 네이버 지도는 마커에 이미지 URL 을 넣는 방식으로 교체 예정 */}
      {markers.map((m) => {
        const size = m.size ?? DEFAULT_MARKER_SIZE;
        return (
          <NaverMapMarkerOverlay
            key={m.id}
            latitude={m.coordinate.latitude}
            longitude={m.coordinate.longitude}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={m.zIndex}
            onTap={m.onPress}
            width={size}
            height={size}
            // 네이버 지도는 마커 안의 글자가 다른 마커와 섞여서, 이름은 마커 아래에 표시합니다 (design-notes 18)
            caption={m.label ? { text: m.label, textSize: 12, color: colors.textStrong, haloColor: colors.white } : undefined}
          >
            <View
              key={`${m.id}/${size}`}
              collapsable={false}
              style={[styles.marker, { width: size, height: size, borderRadius: size / 2, backgroundColor: m.tintColor ?? colors.primary }]}
            />
          </NaverMapMarkerOverlay>
        );
      })}
    </NaverMapView>
  );
});

const styles = StyleSheet.create({
  marker: { borderWidth: 2, borderColor: colors.white },
});
