import * as Location from 'expo-location';

import { placesApi } from '@/api/endpoints/places';
import type { LatLng, SharedPlace } from '@/types/models';

/**
 * 좌표 → 장소명/주소.
 * 서버(네이버 지도)가 연결돼 있으면 건물 이름까지 받아오고, 안 되면 기기 내장 변환으로 대신합니다.
 * 기획: 장소명이 특정되면 제목으로, 아니면 주소만 표시.
 */
export async function describePlace(coordinate: LatLng): Promise<SharedPlace> {
  // 서버(네이버)가 늦으면 '주소 확인 중' 이 한참 떠 있었습니다 (대표 리포트 46·71). 3초까지만 기다리고 기기 변환으로
  const fromServer = await withTimeout(placesApi.reverse(coordinate), SERVER_TIMEOUT_MS).catch(() => null);
  if (fromServer) return fromServer;
  return describeOnDevice(coordinate);
}

const SERVER_TIMEOUT_MS = 3000;
/** 기기 변환도 가끔 멈춥니다. 그때는 좌표로 씁니다 */
const DEVICE_TIMEOUT_MS = 3000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** 주소를 못 찾았을 때 보여 줄 좌표 글자 */
export function coordinateText({ latitude, longitude }: LatLng): string {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

/** 기기 내장 변환만 씁니다 (서버가 이미 주소를 못 붙인 것을 알 때 — 다시 물어봐도 같은 결과) */
export async function describeOnDevice(coordinate: LatLng): Promise<SharedPlace> {
  const [address] = (await withTimeout(Location.reverseGeocodeAsync(coordinate), DEVICE_TIMEOUT_MS).catch(() => null)) ?? [];
  const full = (address?.formattedAddress ?? '').replace(/^대한민국\s*/, '').trim();
  const name = address?.name?.trim();
  // 번지 숫자만 오는 경우는 장소명이 아님
  const placeName = name && !/^[\d-]+$/.test(name) && !full.startsWith(name) ? name : undefined;
  return { ...coordinate, placeName, address: full || coordinateText(coordinate) };
}

/** 주소·장소 검색 → 첫 번째 결과 좌표 */
export async function searchPlace(query: string): Promise<LatLng | null> {
  const [result] = await Location.geocodeAsync(query).catch(() => []);
  return result ? { latitude: result.latitude, longitude: result.longitude } : null;
}
