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
  preferred: 'google' | 'naver';
  /** 유료 등급인가 (features.premiumMap) */
  premium: boolean;
  /** 해외에서 Mapbox 를 쓸 수 있는 등급인가 (features.overseasMap) */
  overseas: boolean;
}

/**
 * 규칙
 *
 * | 위치 | 등급 | 지도 |
 * |---|---|---|
 * | 해외 | 해외 지도 가능 | **Mapbox** |
 * | 해외 | 그 외 | 구글 |
 * | 국내 | 유료 + 네이버 선택 | 네이버 |
 * | 국내 | 그 외 | 구글 |
 *
 * 해외에서는 네이버를 쓰지 않습니다. 유료 등급이 네이버를 골라 뒀더라도, 나가면 지도가 비어 버립니다.
 */
export function resolveMapProvider({ center, preferred, premium, overseas }: MapChoiceInput): MapProvider {
  if (!isInKorea(center)) return overseas ? 'mapbox' : 'google';
  return preferred === 'naver' && premium ? 'naver' : 'google';
}
