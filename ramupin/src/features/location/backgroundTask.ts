import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { enqueueLocation, flushLocationOutbox } from './uploader';
import type { MyLocation } from './useMyLocation';

/**
 * 앱을 보고 있지 않을 때도 위치를 모읍니다 (WBS 2.4, 4.3).
 *
 * 흐름: 안드로이드가 위치를 주면 → SQLite 대기열(location_outbox)에 쌓고 → 서버로 보냅니다.
 * 화면이 떠 있을 때와 같은 대기열을 쓰기 때문에, 꺼져 있는 동안 쌓인 점도 다음 전송에 함께 올라갑니다.
 *
 * 주의: 이 파일은 앱이 켜질 때(화면을 그리기 전에) 반드시 한 번 import 되어야 합니다.
 *       안드로이드가 앱을 백그라운드에서 되살릴 때 defineTask 가 등록되어 있어야 하기 때문입니다 (app/_layout.tsx 에서 import).
 */

export const LOCATION_TASK = 'ramupin-background-location';

/** 배터리를 위해 이 시간마다 묶어서 받습니다 (안드로이드가 그동안의 점을 모아서 한 번에 줍니다) */
const DEFERRED_INTERVAL_MS = 30_000;
const DEFERRED_DISTANCE_M = 30;
/** 대기열에 쌓는 최소 간격 (초). TODO(정책): 등급별 gpsIntervalMovingSec 을 백그라운드에도 반영 */
const MIN_QUEUE_INTERVAL_SEC = 20;

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('[location/bg] 수집 오류', error.message);
    return;
  }
  const locations = data?.locations ?? [];
  if (locations.length === 0) return;

  try {
    let queued = false;
    for (const position of locations) {
      queued = (await enqueueLocation(toMyLocation(position), MIN_QUEUE_INTERVAL_SEC)) || queued;
    }
    if (queued) await flushLocationOutbox();
  } catch (e) {
    // 백그라운드에서 예외가 나면 안드로이드가 태스크를 멈출 수 있어 여기서 삼킵니다
    console.warn('[location/bg] 저장·전송 실패', String(e));
  }
});

function toMyLocation({ coords, timestamp }: Location.LocationObject): MyLocation {
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: coords.accuracy,
    speedKmh: coords.speed != null && coords.speed >= 0 ? coords.speed * 3.6 : null,
    heading: coords.heading,
    altitude: coords.altitude,
    altitudeAccuracy: coords.altitudeAccuracy,
    timestamp,
  };
}

export async function isBackgroundTrackingOn(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  } catch {
    return false;
  }
}

export type StartResult = 'started' | 'need-foreground' | 'need-background' | 'error';

/**
 * 백그라운드 수집을 켭니다.
 * 안드로이드는 "앱 사용 중에만 허용"을 먼저 받은 뒤에야 "항상 허용"을 물어볼 수 있습니다.
 */
export async function startBackgroundTracking(): Promise<StartResult> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== Location.PermissionStatus.GRANTED) return 'need-foreground';

  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== Location.PermissionStatus.GRANTED) return 'need-background';

  if (await isBackgroundTrackingOn()) return 'started';

  try {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: DEFERRED_INTERVAL_MS,
      distanceInterval: DEFERRED_DISTANCE_M,
      // 배터리: 안드로이드가 점을 모았다가 한 번에 전달
      deferredUpdatesInterval: DEFERRED_INTERVAL_MS,
      deferredUpdatesDistance: DEFERRED_DISTANCE_M,
      // 안드로이드는 이 알림이 떠 있어야 백그라운드 수집이 끊기지 않습니다
      foregroundService: {
        notificationTitle: '라무핀이 위치를 확인하고 있어요',
        notificationBody: '보호자에게 위치를 알리기 위해 사용 중입니다. 설정에서 끌 수 있어요.',
        notificationColor: '#0095FF',
        killServiceOnDestroy: false,
      },
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
    });
    return 'started';
  } catch (e) {
    console.warn('[location/bg] 시작 실패', String(e));
    return 'error';
  }
}

export async function stopBackgroundTracking(): Promise<void> {
  if (await isBackgroundTrackingOn()) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
}
