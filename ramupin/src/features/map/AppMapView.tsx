import { forwardRef, useImperativeHandle, useRef, type ReactNode } from 'react';
import { Platform, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { Circle, Marker, Polyline, PROVIDER_GOOGLE, type EdgePadding } from 'react-native-maps';

import type { LatLng } from '@/types/models';

/**
 * 지도 공통 인터페이스.
 * 화면은 이 컴포넌트만 사용하고, 지도 SDK(Google/OS, 네이버, Mapbox)는 이 파일 안에서만 다룹니다.
 * TODO(8단계): 플랜/설정에 따라 NaverMapView, MapboxMapView 구현으로 분기 (WBS 4.4, 5.2, 10.5)
 */
export interface MapMarkerItem {
  id: string;
  coordinate: LatLng;
  /** 마커 모양 (React 뷰) */
  children: ReactNode;
  onPress?: () => void;
  zIndex?: number;
}

export interface MapCircleItem {
  id: string;
  center: LatLng;
  radiusM: number;
  fillColor: string;
  strokeColor: string;
}

export interface MapPolylineItem {
  id: string;
  coordinates: LatLng[];
  color: string;
  width?: number;
}

export interface AppMapViewHandle {
  moveTo: (coordinate: LatLng, zoomDelta?: number) => void;
  fitTo: (coordinates: LatLng[]) => void;
}

interface AppMapViewProps {
  initialCenter: LatLng;
  markers?: MapMarkerItem[];
  circles?: MapCircleItem[];
  polylines?: MapPolylineItem[];
  /** 지도 위를 덮는 UI(바텀시트 등) 만큼 안쪽 여백 */
  padding?: EdgePadding;
  onPress?: () => void;
  /** false = 움직일 수 없는 미리보기 지도 (채팅 위치 말풍선 등, Android lite mode) */
  interactive?: boolean;
  /** 지도 이동이 끝났을 때 화면 중앙 좌표 (핀 고정형 장소 선택) */
  onCenterChange?: (center: LatLng) => void;
  /** 처음 확대 정도 (위도 범위). 작을수록 확대 */
  initialDelta?: number;
  style?: StyleProp<ViewStyle>;
}

const DEFAULT_DELTA = 0.012; // 약 1.3km 범위

export const AppMapView = forwardRef<AppMapViewHandle, AppMapViewProps>(function AppMapView(
  { initialCenter, markers = [], circles = [], polylines = [], padding, onPress, interactive = true, onCenterChange, initialDelta = DEFAULT_DELTA, style },
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
    moveTo: (coordinate, zoomDelta = DEFAULT_DELTA) =>
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
        <Circle
          key={c.id}
          center={c.center}
          radius={c.radiusM}
          fillColor={c.fillColor}
          strokeColor={c.strokeColor}
          strokeWidth={1}
        />
      ))}
      {polylines.map((p) => (
        <Polyline key={p.id} coordinates={p.coordinates} strokeColor={p.color} strokeWidth={p.width ?? 6} lineCap="round" lineJoin="round" />
      ))}
      {markers.map((m) => (
        <Marker
          key={m.id}
          coordinate={m.coordinate}
          anchor={{ x: 0.5, y: 0.5 }}
          onPress={m.onPress}
          zIndex={m.zIndex}
        >
          {m.children}
        </Marker>
      ))}
    </MapView>
  );
});
