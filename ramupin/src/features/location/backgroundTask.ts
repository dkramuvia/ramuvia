import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { PermissionsAndroid, Platform } from 'react-native';

import { loadPolicySnapshot } from '@/features/policy/policySnapshot';
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

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('[location/bg] 수집 오류', error.message);
    return;
  }
  const locations = data?.locations ?? [];
  if (locations.length === 0) return;

  try {
    // 등급별 전송 주기 (WBS 2.1: 앱에 숫자를 넣지 않고 서버 정책을 따름)
    const { gpsIntervalMovingSec } = await loadPolicySnapshot();
    let queued = false;
    for (const position of locations) {
      queued = (await enqueueLocation(toMyLocation(position), gpsIntervalMovingSec)) || queued;
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

  // 안드로이드 13+ 는 알림 권한이 없으면 수집 중 알림이 보이지 않습니다.
  // 알림이 보여야 한다는 것이 포그라운드 서비스의 조건이라 함께 요청합니다 (거절해도 수집은 진행)
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    try {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    } catch (e) {
      console.warn('[location/bg] 알림 권한 요청 실패', String(e));
    }
  }

  if (await isBackgroundTrackingOn()) return 'started';

  try {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      // 거리 조건을 걸면 가만히 있을 때 위치가 아예 오지 않습니다.
      // 머무는 중에도 "그 자리에 있다"를 알려야 해서 시간 기준으로 받습니다.
      // TODO(2단계): 정지·이동·SOS 에 따라 주기를 바꾸는 적응형 로직 (GPS 보고서: 정지 1~5분, 이동 15~30초)
      timeInterval: DEFERRED_INTERVAL_MS,
      distanceInterval: 0,
      deferredUpdatesInterval: DEFERRED_INTERVAL_MS,
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
