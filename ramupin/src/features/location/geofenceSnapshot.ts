import Storage from 'expo-sqlite/kv-store';

import type { Geofence } from '@/types/models';
import { distanceM } from './geo';

/**
 * 백그라운드 수집이 쓰는 안심장소 사본 (GPS 보고서 2-1 2번).
 *
 * **왜 기기에 저장하나**: 안드로이드가 앱을 백그라운드에서 깨울 때는 화면이 없어
 * react-query 캐시가 비어 있습니다. 정책 사본(policySnapshot.ts)과 같은 이유입니다.
 *
 * **폰이 하는 일은 판정이 아닙니다.** 들어갔다·나갔다는 서버가 정합니다 (알림 받는 사람이 친구라서).
 * 폰은 "가까이 왔다"만 보고 수집을 5초로 올려, 경계를 넘은 **시각**이 정확해지게 합니다.
 * 1분 주기로 두면 언제 도착했는지가 최대 1분 어긋납니다.
 */

const KEY = 'geofence-snapshot';

interface Zone {
  latitude: number;
  longitude: number;
  radiusM: number;
}

/**
 * 반경에서 이만큼 더 바깥부터 촘촘하게 모읍니다.
 *
 * 걸어서 200m 는 약 2~3분, 차로는 약 15초입니다. 차로 지나가는 경우까지
 * 놓치지 않으려면 이 정도 여유가 필요합니다. 더 넓히면 도심에서는 계속 촘촘한 수집이 됩니다.
 */
export const NEAR_MARGIN_M = 200;

let cached: Zone[] | null = null;

export async function saveGeofenceSnapshot(geofences: Geofence[]): Promise<void> {
  const zones: Zone[] = geofences
    .filter((g) => g.enabled)
    .map((g) => ({ latitude: g.center.latitude, longitude: g.center.longitude, radiusM: g.radiusM }));
  cached = zones;
  try {
    await Storage.setItem(KEY, JSON.stringify(zones));
  } catch (error) {
    console.warn('[location] 안심장소 사본 저장 실패', String(error));
  }
}

async function loadZones(): Promise<Zone[]> {
  if (cached) return cached;
  try {
    const raw = await Storage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    cached = Array.isArray(parsed) ? (parsed.filter(isZone) as Zone[]) : [];
  } catch {
    cached = [];
  }
  return cached;
}

/** 지금 위치가 안심장소 근처인지 (반경 + 여유 안) */
export async function isNearGeofence(here: { latitude: number; longitude: number }): Promise<boolean> {
  const zones = await loadZones();
  if (zones.length === 0) return false;
  return zones.some((zone) => distanceM(zone, here) <= zone.radiusM + NEAR_MARGIN_M);
}

function isZone(value: unknown): value is Zone {
  const z = value as Zone | null;
  return !!z && typeof z.latitude === 'number' && typeof z.longitude === 'number' && typeof z.radiusM === 'number';
}
