import * as Battery from 'expo-battery';

import { locationsApi, type LocationPointPayload } from '@/api/endpoints/locations';
import { isLive } from '@/config/env';
import { getDb } from '@/db';
import { restoreSession } from '@/features/auth/session';
import { useAuthStore } from '@/stores/authStore';
import type { MyLocation } from './useMyLocation';

/**
 * 내 위치 서버 전송.
 * 받은 위치를 먼저 SQLite 대기열(location_outbox)에 쌓고, 모아서 POST /locations 로 보냅니다.
 * 네트워크가 끊겨도 대기열에 남아 있다가 다음 전송 때 함께 올라갑니다.
 * 화면이 떠 있을 때(useLocationUpload)와 백그라운드 수집(backgroundTask)이 같은 대기열을 씁니다.
 *
 * 저장과 전송을 나눈 이유: 안드로이드가 앱을 백그라운드에서 깨우면 화면이 없어 로그인 복원이 끝나지 않은
 * 상태일 수 있습니다. 그때도 위치는 일단 쌓아 두고, 토큰이 준비되면 그때 함께 올립니다.
 */

const BATCH_SIZE = 500;
/** 오래 못 보낸 점은 버립니다 (서버 보관 기간과 별개로 기기 용량 보호) */
const MAX_QUEUE = 5000;
/** 대기열에서 이 시간보다 오래된 점은 버립니다 */
const MAX_AGE_MS = 7 * 24 * 60 * 60_000;

let lastQueuedAt = 0;
let flushing: Promise<void> | null = null;

/** 목업 모드에서는 쌓지도 보내지도 않습니다 */
const canCollect = () => isLive('location');

function hasRealToken(): boolean {
  const token = useAuthStore.getState().accessToken;
  // 서버 연결에 실패해 목업 토큰으로 진행 중이면 보내지 않습니다
  return !!token && token !== 'dev-token';
}

async function readBattery(): Promise<number | null> {
  try {
    const level = await Battery.getBatteryLevelAsync();
    return level >= 0 ? Math.round(level * 100) : null;
  } catch {
    return null;
  }
}

/**
 * 위치 하나를 대기열에 넣습니다.
 * @param minIntervalSec 직전에 넣은 점과 이 시간(초)보다 가까우면 건너뜀 (등급 정책 gpsIntervalMovingSec)
 */
export async function enqueueLocation(location: MyLocation, minIntervalSec: number): Promise<boolean> {
  if (!canCollect()) return false;
  if (location.timestamp - lastQueuedAt < minIntervalSec * 1000) return false;
  lastQueuedAt = location.timestamp;

  const payload: LocationPointPayload = {
    latitude: location.latitude,
    longitude: location.longitude,
    measuredAt: new Date(location.timestamp).toISOString(),
    altitude: location.altitude,
    accuracy: location.accuracy,
    altitudeAccuracy: location.altitudeAccuracy,
    speed: location.speedKmh != null ? location.speedKmh / 3.6 : null,
    heading: location.heading != null && location.heading >= 0 ? location.heading : null,
    provider: 'fused',
    battery: await readBattery(),
    state: location.speedKmh != null && location.speedKmh >= 3 ? 'moving' : 'still',
  };

  const db = getDb();
  await db.runAsync('INSERT INTO location_outbox (payload, measured_at) VALUES (?, ?)', JSON.stringify(payload), payload.measuredAt);
  await db.runAsync(
    'DELETE FROM location_outbox WHERE measured_at < ? OR seq <= (SELECT MAX(seq) FROM location_outbox) - ?',
    new Date(Date.now() - MAX_AGE_MS).toISOString(),
    MAX_QUEUE,
  );
  return true;
}

export interface OutboxStats {
  /** 아직 서버로 못 보낸 점 개수 */
  count: number;
  /** 가장 오래된 점의 측정 시각 (ISO) */
  oldest: string | null;
  /** 가장 최근에 모은 점의 측정 시각 (ISO) */
  newest: string | null;
}

/** 수집·전송이 잘 되는지 확인용 (설정 > 위치 수집) */
export async function outboxStats(): Promise<OutboxStats> {
  const row = await getDb().getFirstAsync<{ count: number; oldest: string | null; newest: string | null }>(
    'SELECT COUNT(*) AS count, MIN(measured_at) AS oldest, MAX(measured_at) AS newest FROM location_outbox',
  );
  return { count: row?.count ?? 0, oldest: row?.oldest ?? null, newest: row?.newest ?? null };
}

/** 대기열을 서버로 보냅니다. 동시에 여러 번 불러도 한 번만 실행됩니다. */
export function flushLocationOutbox(): Promise<void> {
  if (!canCollect()) return Promise.resolve();
  flushing ??= (async () => {
    const db = getDb();
    try {
      // 백그라운드에서 깨어난 직후라면 로그인 상태가 아직 없습니다. 저장된 refresh token 으로 되살립니다
      if (!hasRealToken() && !(await restoreSession())) return;
      for (;;) {
        const rows = await db.getAllAsync<{ seq: number; payload: string }>(
          'SELECT seq, payload FROM location_outbox ORDER BY seq LIMIT ?',
          BATCH_SIZE,
        );
        if (rows.length === 0) return;
        const maxSeq = rows[rows.length - 1].seq;
        try {
          await locationsApi.upload(rows.map((r) => JSON.parse(r.payload) as LocationPointPayload));
        } catch (error: unknown) {
          const status = (error as { response?: { status?: number } }).response?.status;
          if (status === 400) {
            // 서버가 형식을 거절한 점은 다시 보내도 실패하므로 버립니다
            console.warn('[location] 서버가 거절한 위치 삭제', rows.length);
            await db.runAsync('DELETE FROM location_outbox WHERE seq <= ?', maxSeq);
            continue;
          }
          await db.runAsync('UPDATE location_outbox SET attempts = attempts + 1 WHERE seq <= ?', maxSeq);
          return;
        }
        await db.runAsync('DELETE FROM location_outbox WHERE seq <= ?', maxSeq);
        if (rows.length < BATCH_SIZE) return;
      }
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}
