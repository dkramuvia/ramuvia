import { useIsFocused } from 'expo-router';
import { forwardRef, lazy, Suspense, useEffect, useState, type Ref } from 'react';

import { GoogleMapImpl } from './GoogleMapImpl';
import { NaverMapImpl } from './NaverMapImpl';
import { resolveMapProvider } from './region';
import type { MapImplHandle, MapImplProps } from './types';
import { DEMO_UNLOCK_MAPS } from '@/features/policy/policies';
import { usePlan } from '@/features/policy/usePlan';
import { usePreferencesStore } from '@/stores/preferencesStore';

export type { MapCircleItem, MapMarkerItem, MapPolylineItem } from './types';
export type AppMapViewHandle = MapImplHandle;

type AppMapViewProps = Omit<MapImplProps, 'initialDelta' | 'mapType' | 'nightMode'> & {
  /** 처음 확대 정도 (위도 범위). 작을수록 확대 */
  initialDelta?: number;
};

const DEFAULT_DELTA = 0.012; // 약 1.3km 범위

/**
 * 해외 지도는 필요할 때만 불러옵니다.
 *
 * 그냥 import 하면 국내에서만 쓰는 사람도 앱이 켜질 때 Mapbox 네이티브 지도가 함께 올라옵니다.
 * 안 쓰는 지도 표면이 떠 있으면 다른 화면을 뚫고 비쳐 보이는 문제가 생깁니다 (09-21 확인).
 */
const MapboxImpl = lazy(() => import('./MapboxImpl').then((m) => ({ default: m.MapboxImpl })));

/**
 * 지도를 바꾸기 전에 마커를 먼저 걷어 내는 시간(ms).
 *
 * **네이버 지도는 마커가 붙은 채로 화면에서 내려가면 앱이 죽습니다.**
 * 네이버 SDK 는 마커를 "지도가 준비된 다음에" 등록하는데, 준비가 끝나기 전에 화면이
 * 내려가면 SDK 쪽 마커 목록은 빈 채로 남습니다. 그 뒤 리액트가 "1번 마커를 떼라"고 하면
 * 없는 것을 찾다가 터집니다
 * (`RNCNaverMapViewManager.getChildAt` → IndexOutOfBounds, 2026-09-29 폰에서 확인).
 *
 * 그래서 지도를 바꿀 때는 **마커 없는 지도**를 아주 잠깐 먼저 그려서
 * 마커를 정상적으로 떼어 낸 뒤에 바꿉니다. 눈에는 보이지 않는 시간입니다.
 */
const MARKER_CLEANUP_MS = 60;

/**
 * 지도 공통 컴포넌트.
 * 화면은 이것만 사용하고, 지도 SDK 는 GoogleMapImpl / NaverMapImpl 안에서만 다룹니다.
 * 어떤 지도를 쓸지는 지금 위치·설정·등급이 함께 정합니다 (규칙은 region.ts).
 */
export const AppMapView = forwardRef<AppMapViewHandle, AppMapViewProps>(function AppMapView(props, ref: Ref<AppMapViewHandle>) {
  const { mapProvider, mapType, mapTheme } = usePreferencesStore();
  const { can } = usePlan();

  // 프리미엄 지도는 유료 등급에서만. 등급이 바뀌면 자동으로 기본 지도로 돌아갑니다
  const provider = resolveMapProvider({
    center: props.initialCenter,
    preferred: mapProvider === 'os' ? 'google' : mapProvider,
    premium: can('premiumMap'),
    overseas: can('overseasMap'),
    unlocked: DEMO_UNLOCK_MAPS,
  });
  /**
   * 지금 화면에 떠 있는 지도. 설정에서 바꿔도 곧바로 갈아 끼우지 않습니다.
   *
   * **안 보이는 동안에는 바꾸지 않습니다.** 설정 화면에서 지도를 고르면 그 뒤에 가려져
   * 있는 지도 탭도 같이 바뀌는데, 가려진 지도는 네이버 SDK 초기화를 끝내지 못한 상태라
   * 그대로 내리면 앱이 죽습니다. 지도 탭으로 돌아왔을 때 바꿉니다.
   */
  const focused = useIsFocused();
  const [shown, setShown] = useState(provider);
  const swapping = shown !== provider;

  useEffect(() => {
    if (!swapping || !focused) return;
    const timer = setTimeout(() => setShown(provider), MARKER_CLEANUP_MS);
    return () => clearTimeout(timer);
  }, [swapping, focused, provider]);

  const Impl = shown === 'naver' ? NaverMapImpl : shown === 'mapbox' ? MapboxImpl : GoogleMapImpl;
  const map = (
    <Impl
      ref={ref}
      {...props}
      // 바꾸는 중에는 마커·원·선을 잠깐 걷어 냅니다
      markers={swapping ? undefined : props.markers}
      circles={swapping ? undefined : props.circles}
      polylines={swapping ? undefined : props.polylines}
      initialDelta={props.initialDelta ?? DEFAULT_DELTA}
      mapType={mapType}
      nightMode={mapTheme === 'dark'}
    />
  );

  // Mapbox 만 나중에 불러오므로 그때만 기다림 처리가 필요합니다
  return shown === 'mapbox' ? <Suspense fallback={null}>{map}</Suspense> : map;
});
