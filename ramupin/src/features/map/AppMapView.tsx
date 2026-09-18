import { forwardRef, type Ref } from 'react';

import { GoogleMapImpl } from './GoogleMapImpl';
import { MapboxImpl } from './MapboxImpl';
import { NaverMapImpl } from './NaverMapImpl';
import { resolveMapProvider } from './region';
import type { MapImplHandle, MapImplProps } from './types';
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
    preferred: mapProvider === 'naver' ? 'naver' : 'google',
    premium: can('premiumMap'),
    overseas: can('overseasMap'),
  });
  const Impl = provider === 'naver' ? NaverMapImpl : provider === 'mapbox' ? MapboxImpl : GoogleMapImpl;

  return <Impl ref={ref} {...props} initialDelta={props.initialDelta ?? DEFAULT_DELTA} mapType={mapType} nightMode={mapTheme === 'dark'} />;
});
