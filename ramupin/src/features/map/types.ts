import type { ImageURISource } from 'react-native';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import type { Preferences } from '@/stores/preferencesStore';
import type { LatLng } from '@/types/models';

/** 지도 위에 올리는 것들 (지도 SDK 와 무관한 공통 모양) */
export interface MapMarkerItem {
  id: string;
  coordinate: LatLng;
  /** 마커 모양 (React 뷰) */
  children: ReactNode;
  /**
   * 뷰 대신 **그림 파일을 마커 아이콘으로** 씁니다 (안드로이드).
   * 뷰를 구워 올리는 방식은 그림이 빠지므로, 캐릭터는 이쪽으로 넣습니다.
   */
  iconImage?: number | ImageURISource;
  /** 마커의 어느 지점을 좌표에 맞출지 (기본 가운데). {x:0.5,y:0} 이면 위쪽 가운데 */
  anchor?: { x: number; y: number };
  /**
   * 마커 내용이 바뀌었는지 알려 주는 값 (이름·캐릭터·상태 문구 등을 이어 붙인 문자열).
   * 안드로이드 지도는 마커를 그림으로 구워 두기 때문에, 이 값이 바뀔 때만 다시 굽습니다.
   * 주지 않으면 처음 한 번만 굽습니다 → `TrackedMarker.tsx`
   */
  trackKey?: string;
  onPress?: () => void;
  zIndex?: number;
  /** 마커 크기(px). 네이버 지도는 크기를 알려줘야 그려집니다 (기본 52 = 아바타 마커) */
  size?: number;
  /** 마커 이름. 네이버 지도에서는 마커 아래 이름으로 표시됩니다 */
  label?: string;
  /** 마커 테두리 색 (네이버 지도용. 내 마커 구분) */
  tintColor?: string;
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

/** 지도 위를 덮는 UI(바텀시트 등) 만큼 안쪽 여백 */
export interface MapPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface MapImplHandle {
  moveTo: (coordinate: LatLng, zoomDelta?: number) => void;
  fitTo: (coordinates: LatLng[]) => void;
}

/** 지도 구현(Google/네이버)이 공통으로 받는 값 */
export interface MapImplProps {
  initialCenter: LatLng;
  markers?: MapMarkerItem[];
  circles?: MapCircleItem[];
  polylines?: MapPolylineItem[];
  padding?: MapPadding;
  onPress?: () => void;
  /** false = 움직일 수 없는 미리보기 지도 */
  interactive?: boolean;
  /** 지도 이동이 끝났을 때 화면 중앙 좌표 (핀 고정형 장소 선택) */
  onCenterChange?: (center: LatLng) => void;
  /** 처음 확대 정도 (위도 범위). 작을수록 확대 */
  initialDelta: number;
  mapType: Preferences['mapType'];
  /** 어두운 지도 (설정 > 지도 스타일) */
  nightMode: boolean;
  style?: StyleProp<ViewStyle>;
}
