import * as Location from 'expo-location';

import type { LatLng, SharedPlace } from '@/types/models';

/**
 * 좌표 → 장소명/주소 (기기 내장 Geocoder).
 * 기획: 장소명이 특정되면 제목으로, 아니면 주소만 표시.
 * TODO(5단계): POI 이름(예: 삼성 코엑스)은 기기 Geocoder 로는 거의 안 나옴 → 서버 또는 Places API 로 교체
 */
export async function describePlace(coordinate: LatLng): Promise<SharedPlace> {
  const [address] = await Location.reverseGeocodeAsync(coordinate).catch(() => []);
  const full = (address?.formattedAddress ?? '').replace(/^대한민국\s*/, '').trim();
  const name = address?.name?.trim();
  // 번지 숫자만 오는 경우는 장소명이 아님
  const placeName = name && !/^[\d-]+$/.test(name) && !full.startsWith(name) ? name : undefined;
  return { ...coordinate, placeName, address: full || `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}` };
}

/** 주소·장소 검색 → 첫 번째 결과 좌표 */
export async function searchPlace(query: string): Promise<LatLng | null> {
  const [result] = await Location.geocodeAsync(query).catch(() => []);
  return result ? { latitude: result.latitude, longitude: result.longitude } : null;
}
