import * as Location from 'expo-location';

import { placesApi } from '@/api/endpoints/places';
import type { LatLng, SharedPlace } from '@/types/models';

/**
 * 좌표 → 장소명/주소.
 * 서버(네이버 지도)가 연결돼 있으면 건물 이름까지 받아오고, 안 되면 기기 내장 변환으로 대신합니다.
 * 기획: 장소명이 특정되면 제목으로, 아니면 주소만 표시.
 */
export async function describePlace(coordinate: LatLng): Promise<SharedPlace> {
  const fromServer = await placesApi.reverse(coordinate).catch(() => null);
  if (fromServer) return fromServer;

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
