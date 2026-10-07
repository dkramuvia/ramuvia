import type { ImageURISource } from 'react-native';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import type { Preferences } from '@/stores/preferencesStore';
import type { LatLng } from '@/types/models';
import type { SpriteSheet } from './spriteTypes';

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
   * 마커 **바닥을 좌표보다 이만큼(dp) 위에** 놓습니다 (핀 위 배지). 구운 지도는 그려진 높이를 재서
   * anchor 를 다시 계산합니다 — 높이를 짐작으로 두면 글꼴·기기에 따라 간격이 틀어집니다.
   * `anchor` 는 재기 전까지 쓰는 짐작값입니다.
   */
  lift?: number;
  /**
   * 마커 내용이 바뀌었는지 알려 주는 값 (이름·캐릭터·상태 문구 등을 이어 붙인 문자열).
   * 안드로이드 지도는 마커를 그림으로 구워 두기 때문에, 이 값이 바뀔 때만 다시 굽습니다.
   * 주지 않으면 처음 한 번만 굽습니다 → `TrackedMarker.tsx`
   */
  trackKey?: string;
  onPress?: () => void;
  zIndex?: number;
  /**
   * 이 마커는 **움직이는 그림 하나**입니다 (발자국). `children` 대신 씁니다.
   * `offset` = 좌표에서 그림 가운데까지(dp). 지금은 안드로이드 구글 지도에서만 그립니다.
   */
  sprite?: { sheet: SpriteSheet; offset: { x: number; y: number } };
  /**
   * 배지 마커(BadgeMarker)의 그림 칸에 겹칠 움직이는 그림.
   * 그림을 구워 올리는 지도(안드로이드 구글)에서만 씁니다 — 나머지는 배지 안에서 바로 움직입니다.
   */
  badgeSprite?: { sheet: SpriteSheet };
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
