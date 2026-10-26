import { getLocales } from 'expo-localization';

import type { LatLng } from '@/types/models';

/**
 * 어느 지도를 쓸지 고르는 규칙 (WBS 4.4, 10.5).
 *
 * 지도가 세 개인 이유:
 *   네이버 — 국내 지도·로드뷰·장소명이 가장 정확. 대신 **해외는 거의 비어 있습니다**
 *   Mapbox — 해외 전용. 유료 등급만 (09-18 대표 결정). 지도를 띄울 때마다 과금됩니다
 *   구글   — 그 외 전부. 어디서나 되고 추가 비용이 없습니다
 */

/** 지도 구현 종류 */
export type MapProvider = 'google' | 'naver' | 'mapbox';

/**
 * 한국 영역(대략). 울릉도·독도·마라도까지 들어갑니다.
 *
 * 국가 경계를 정확히 따지지 않고 사각형으로 봅니다. 이 판정은 "어느 지도를 띄울까"에만 쓰이고
 * 틀려도 다른 지도가 나올 뿐입니다. 좌표를 서버에 물어보면 지도를 띄울 때마다 요청이 생깁니다.
 *
 * 알려진 한계: 쓰시마(일본)가 이 사각형 안에 들어갑니다. 배를 타고 그 근처에 있으면
 * 네이버 지도가 뜨는데 그 지역은 비어 있습니다. 실제로 겪을 일이 드물어 그대로 둡니다.
 */
const KOREA = { minLat: 32.9, maxLat: 38.7, minLng: 124.5, maxLng: 132.0 };

export function isInKorea(coordinate: LatLng | null | undefined): boolean {
  if (!coordinate) return true; // 위치를 모르면 국내로 봅니다 (대부분 국내 사용자)
  const { latitude, longitude } = coordinate;
  return (
    latitude >= KOREA.minLat && latitude <= KOREA.maxLat && longitude >= KOREA.minLng && longitude <= KOREA.maxLng
  );
}

export interface MapChoiceInput {
  /** 지금 보고 있는 위치 */
  center: LatLng | null | undefined;
  /** 설정 > 지도에서 고른 지도 */
  preferred: MapProvider;
  /** 유료 등급인가 (features.premiumMap) */
  premium: boolean;
  /** 해외에서 Mapbox 를 쓸 수 있는 등급인가 (features.overseasMap) */
  overseas: boolean;
  /** 기기 언어가 한국어인가. 네이버 지도는 이때만 고를 수 있습니다 (대표 확정 방침, 보완 4.15) */
  koreanSystem?: boolean;
  /**
   * 시연용 — 등급도 지역도 따지지 않고 **고른 지도를 그대로** 띄웁니다.
   * 국내에서도 Mapbox 를 볼 수 있습니다 (`DEMO_UNLOCK_MAPS`).
   */
  unlocked?: boolean;
}

/**
 * 규칙 (보완 4.15, 대표 확정 방침: 한국 지도(네이버)는 시스템이 한국어일 때만, 그 외에는 등급에 따라 기본 지도 또는 MapBox)
 *
 * | 고른 지도 | 등급 | 위치 | 지도 |
 * |---|---|---|---|
 * | MapBox | 유료 | 어디든 | **Mapbox** |
 * | 네이버 | 유료 + 기기 한국어 | 국내 | 네이버 |
 * | 네이버·기본 | 해외 지도 가능 | 해외 | Mapbox (네이버는 해외가 비어 있음) |
 * | 그 외 | | | 구글 (기기 기본) |
 */
export function resolveMapProvider({ center, preferred, premium, overseas, koreanSystem = true, unlocked }: MapChoiceInput): MapProvider {
  // 시연용: 고른 지도를 그대로. 세 지도를 다 보여 줘야 해서 규칙을 건너뜁니다
  if (unlocked) return preferred;
  if (preferred === 'mapbox') return premium ? 'mapbox' : 'google';
  if (!isInKorea(center)) return overseas ? 'mapbox' : 'google';
  return preferred === 'naver' && premium && koreanSystem ? 'naver' : 'google';
}

/** 기기 언어가 한국어인가 (앱 언어 설정과 별개로, 네이버 지도 노출 기준) */
export function isKoreanSystem(): boolean {
  return getLocales()[0]?.languageCode === 'ko';
}
