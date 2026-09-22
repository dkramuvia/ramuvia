import * as Battery from 'expo-battery';
import Storage from 'expo-sqlite/kv-store';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState, PermissionsAndroid, Platform } from 'react-native';

import { loadPolicySnapshot, type PolicySnapshot } from '@/features/policy/policySnapshot';
import {
  getActivity,
  isGpsModuleAvailable,
  startActivityUpdates,
  startSatelliteUpdates,
  stopActivityUpdates,
  stopSatelliteUpdates,
} from '../../../modules/ramupin-gps';
import { ADAPTIVE, decideState, intervalSecFor, type MoveState } from './adaptive';
import { distanceM } from './geo';
import { isNearGeofence } from './geofenceSnapshot';
import { isSosActive } from './sosMode';
import { isWatched } from './watchMode';
import { enqueueLocation, flushIfDue } from './uploader';
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

/**
 * 사용자가 "앱을 꺼도 위치 알리기"를 켜 두었는지.
 *
 * 왜 따로 저장하나: 앱을 강제 종료하면(사용자가 직접, 또는 배터리 최적화 앱이) 안드로이드가
 * 수집을 멈추고 **자동으로 되살리지 않습니다.** 그러면 위치가 조용히 끊깁니다.
 * 그래서 "켜 두었다"는 사실을 기기에 남기고, 앱이 다시 켜질 때 되살립니다.
 */
const WANT_TRACKING_KEY = 'location-tracking-on';

/** 아직 위치를 한 번도 못 받았을 때 쓰는 첫 주기 (곧 상태에 맞게 바뀝니다) */
const INITIAL_INTERVAL_SEC = 30;
/** 지금 안드로이드에 걸어 둔 주기·정확도. 값이 달라질 때만 다시 겁니다 */
let appliedIntervalSec: number | null = null;
let appliedAccuracy: Location.LocationAccuracy | null = null;

/**
 * 태스크를 한 번에 하나씩만 돌립니다.
 *
 * 09-18 확인: 앱이 되살아나면 안드로이드가 그동안 모아 둔 위치를 **한꺼번에 여러 번** 넘깁니다.
 * 그대로 두면 22번이 동시에 돌면서 대기열 간격 판단이 어긋나고, 수집 주기도 22번 다시 걸립니다.
 */
let taskQueue: Promise<void> = Promise.resolve();

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, ({ data, error }) => {
  if (error) {
    console.warn('[location/bg] 수집 오류', error.message);
    return Promise.resolve();
  }
  const locations = data?.locations ?? [];
  if (locations.length === 0) return Promise.resolve();

  taskQueue = taskQueue.then(() => handleLocations(locations)).catch(() => undefined);
  return taskQueue;
});

async function handleLocations(locations: Location.LocationObject[]) {
  // 앱이 다시 시작돼도 수집은 OS 가 계속 돌리므로, 위성 구독은 여기서 챙깁니다.
  // 이미 구독 중이면 아무것도 하지 않습니다
  ensureSatelliteUpdates();

  try {
    // 수집·전송 주기는 모두 서버 정책값 (WBS 2.1: 앱에 숫자를 넣지 않음)
    const policy = await loadPolicySnapshot();
    const latest = toMyLocation(locations[locations.length - 1]);
    // 이동 중인지에 따라 대기열에 쌓는 최소 간격이 달라집니다
    const state = await currentState(latest, policy);
    const minGapSec = intervalSecFor(state, policy);

    // 이동 중에만 거리 조건을 겁니다 (GPS 보고서 2-2). 신호 대기처럼 길에 서 있을 때
    // 같은 자리를 반복해서 쌓지 않되, 머무는 주기가 지나면 하나는 넣어 신호 두절로 오해받지 않게 합니다
    const rule =
      state === 'moving' && policy.moveDistanceM > 0
        ? { minGapSec, minDistanceM: policy.moveDistanceM, forceAfterSec: policy.gpsIntervalStillSec }
        : { minGapSec };
    for (const position of locations) {
      await enqueueLocation(toMyLocation(position), rule);
    }
    // 평소에는 정책 주기(기본 60초)마다 모아서 보냅니다. 서버 요청 수가 크게 줄어듭니다.
    // 다만 누가 보고 있을 때는 모아 두면 그만큼 늦게 보이므로 바로 보냅니다 (GPS 보고서 2-1 6번).
    // 새로 쌓인 게 없어도 부릅니다. 지난번 전송이 실패해 남아 있을 수 있습니다
    // SOS·조회 중에는 모아 두면 그만큼 늦게 보입니다. 바로 보냅니다
    await flushIfDue(state === 'sos' || state === 'watched' ? 0 : policy.uploadIntervalSec);

    await applyAdaptiveInterval(state, minGapSec);
  } catch (e) {
    // 백그라운드에서 예외가 나면 안드로이드가 태스크를 멈출 수 있어 여기서 삼킵니다
    console.warn('[location/bg] 저장·전송 실패', String(e));
  }
}

/**
 * 머물던 자리(기준점). "집안에서 걸어다니는 것"과 "밖으로 나간 것"을 가릅니다.
 *
 * 프로세스가 죽었다 살아나도 남아야 하므로 기기에 저장합니다.
 * 이게 없으면 앱이 되살아날 때마다 기준점이 지금 위치로 잡혀, 집을 나선 것을 놓칩니다.
 */
const ANCHOR_KEY = 'location-stay-anchor';
let anchor: { latitude: number; longitude: number } | null = null;
let anchorLoaded = false;

async function loadAnchor() {
  if (anchorLoaded) return;
  anchorLoaded = true;
  try {
    const raw = await Storage.getItem(ANCHOR_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { latitude?: unknown; longitude?: unknown };
    if (typeof parsed.latitude === 'number' && typeof parsed.longitude === 'number') {
      anchor = { latitude: parsed.latitude, longitude: parsed.longitude };
    }
  } catch {
    // 못 읽으면 다음 정지 판정 때 다시 잡힙니다
  }
}

async function setAnchor(location: MyLocation) {
  anchor = { latitude: location.latitude, longitude: location.longitude };
  try {
    await Storage.setItem(ANCHOR_KEY, JSON.stringify(anchor));
  } catch (e) {
    console.warn('[location/bg] 기준점 저장 실패', String(e));
  }
}

/** 지금이 정지인지 이동인지 저배터리인지 (배터리·활동 인식·기준점까지 같이 봅니다) */
async function currentState(latest: MyLocation, policy: PolicySnapshot): Promise<MoveState> {
  await loadAnchor();
  const [battery, watched, sos, nearGeofence] = await Promise.all([
    readBatteryForState(),
    isWatched(),
    isSosActive(),
    isNearGeofence(latest),
  ]);
  const { state, reanchor } = decideState({
    speedKmh: latest.speedKmh,
    battery: battery.level,
    charging: battery.charging,
    activity: getActivity(),
    distanceFromAnchorM: anchor ? distanceM(anchor, latest) : null,
    lowBatteryPercent: policy.lowBatteryPercent,
    nearGeofence,
    watched,
    sos,
  });
  // 기준점이 아직 없거나, 다른 곳에 도착해 자리를 잡았으면 지금 위치로 옮깁니다
  if (!anchor || reanchor) await setAnchor(latest);
  return state;
}

/**
 * 상태에 맞게 수집 주기와 정확도를 다시 겁니다.
 * 값이 그대로면 아무것도 하지 않습니다 (괜히 다시 걸면 수집이 잠깐 끊깁니다).
 */
async function applyAdaptiveInterval(state: MoveState, intervalSec: number) {
  const accuracy = ADAPTIVE[state].accuracy;
  if (appliedIntervalSec === intervalSec && appliedAccuracy === accuracy) return;

  // 백그라운드에서는 멈췄다 다시 걸 수 없으므로, 옵션만 바꿔 봅니다.
  // 실패하면 기존 주기로 계속 수집되고, 다음에 화면이 켜졌을 때 다시 시도합니다
  const started = await startUpdates(intervalSec, accuracy, { allowRestart: true });
  if (started) {
    appliedIntervalSec = intervalSec;
    appliedAccuracy = accuracy;
    console.log(`[location/bg] ${state} → ${intervalSec}초 주기 (정확도 ${accuracy})`);
  }
}

/** 활동 인식을 이 주기로 받습니다. 너무 짧으면 배터리를 먹습니다 */
const ACTIVITY_INTERVAL_MS = 60_000;

/** 위성·활동 구독이 살아 있는지 확인하고, 없으면 시작합니다 */
let sensorsLogged = false;
function ensureSatelliteUpdates() {
  const satellites = startSatelliteUpdates();
  void startActivityUpdates(ACTIVITY_INTERVAL_MS).then((activity) => {
    if (sensorsLogged) return;
    sensorsLogged = true;
    console.log(
      `[location/bg] 모듈 ${isGpsModuleAvailable() ? '있음' : '없음'}, 위성 ${satellites ? 'O' : 'X'}, 활동인식 ${activity ? 'O' : 'X'}`,
    );
  });
}

async function readBatteryForState(): Promise<{ level: number | null; charging: boolean | null }> {
  try {
    const [level, batteryState] = await Promise.all([Battery.getBatteryLevelAsync(), Battery.getBatteryStateAsync()]);
    return {
      level: level >= 0 ? Math.round(level * 100) : null,
      charging: batteryState === Battery.BatteryState.CHARGING || batteryState === Battery.BatteryState.FULL,
    };
  } catch {
    return { level: null, charging: null };
  }
}

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

  // 걷기·차량 판별 권한 (WBS 2.3). 거절해도 위치 수집은 그대로 됩니다
  if (Platform.OS === 'android' && Platform.Version >= 29) {
    try {
      await PermissionsAndroid.request('android.permission.ACTIVITY_RECOGNITION' as never);
    } catch (e) {
      console.warn('[location/bg] 활동 인식 권한 요청 실패', String(e));
    }
  }

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

  // 위성 수·신호 강도 구독 (WBS 2.3). 모듈이 없는 빌드에서는 false 만 돌아옵니다
  ensureSatelliteUpdates();

  const started = await startUpdates(INITIAL_INTERVAL_SEC, Location.Accuracy.Balanced, { allowRestart: true });
  if (!started) return 'error';
  appliedIntervalSec = INITIAL_INTERVAL_SEC;
  appliedAccuracy = Location.Accuracy.Balanced;
  await Storage.setItem(WANT_TRACKING_KEY, 'on');
  return 'started';
}

/**
 * 앱이 켜질 때 수집을 되살립니다.
 * 강제 종료 뒤에는 안드로이드가 알아서 다시 켜 주지 않기 때문입니다.
 * 권한을 새로 묻지 않습니다 (이미 허락한 경우에만 되살림).
 */
export async function resumeBackgroundTrackingIfWanted(): Promise<boolean> {
  try {
    if ((await Storage.getItem(WANT_TRACKING_KEY)) !== 'on') return false;
    if (await isBackgroundTrackingOn()) return true;

    const background = await Location.getBackgroundPermissionsAsync();
    if (background.status !== Location.PermissionStatus.GRANTED) return false;

    ensureSatelliteUpdates();
    const started = await startUpdates(INITIAL_INTERVAL_SEC, Location.Accuracy.Balanced);
    if (started) {
      appliedIntervalSec = INITIAL_INTERVAL_SEC;
      appliedAccuracy = Location.Accuracy.Balanced;
      console.log('[location/bg] 강제 종료 뒤 수집을 다시 시작했습니다');
    }
    return started;
  } catch (e) {
    console.warn('[location/bg] 되살리기 실패', String(e));
    return false;
  }
}

/**
 * 안드로이드에 수집을 겁니다. 이미 돌고 있으면 주기·정확도만 바뀝니다.
 *
 * 거리 조건(distanceInterval)은 쓰지 않습니다. 걸어 두면 가만히 있을 때 위치가 아예 안 와서
 * "그 자리에 계속 있다"를 알 수 없기 때문입니다 (이상징후 GPS 고정 판정에 필요).
 */
async function startUpdates(intervalSec: number, accuracy: Location.LocationAccuracy, options?: { allowRestart?: boolean }): Promise<boolean> {
  const ms = intervalSec * 1000;
  const taskOptions: Location.LocationTaskOptions = {
    accuracy,
    timeInterval: ms,
    distanceInterval: 0,
    // 배터리: 안드로이드가 점을 모았다가 한 번에 전달
    deferredUpdatesInterval: ms,
    // 안드로이드는 이 알림이 떠 있어야 백그라운드 수집이 끊기지 않습니다
    foregroundService: {
      notificationTitle: '라무핀이 위치를 확인하고 있어요',
      notificationBody: '보호자에게 위치를 알리기 위해 사용 중입니다. 설정에서 끌 수 있어요.',
      notificationColor: '#0095FF',
      killServiceOnDestroy: false,
    },
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
  };

  const running = await isBackgroundTrackingOn();

  // ★ 안드로이드 12+ 는 앱이 백그라운드일 때 포그라운드 서비스를 새로 시작하지 못하게 막습니다.
  //   ("Foreground service cannot be started when the application is in the background")
  //   그래서 화면이 꺼진 상태에서 멈췄다 다시 걸면 다시 켜지지 않고 수집이 죽어 버립니다 (09-17 실기기 확인).
  //   이미 돌고 있는 것을 멈추는 건 화면이 켜져 있을 때만 합니다.
  const canRestart = (options?.allowRestart ?? false) && AppState.currentState === 'active';

  try {
    if (running && canRestart) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    }
    await Location.startLocationUpdatesAsync(LOCATION_TASK, taskOptions);

    // 정말 걸렸는지 확인합니다. 수집이 조용히 멈추는 것이 이 앱에서 가장 위험한 고장입니다
    if (!(await isBackgroundTrackingOn())) {
      console.warn('[location/bg] 시작했는데 실행 중이 아닙니다');
      return false;
    }
    return true;
  } catch (e) {
    // 실패해도 이미 돌던 수집은 그대로 둡니다. 주기만 예전 값으로 남을 뿐, 위치는 계속 들어옵니다
    console.warn(`[location/bg] 주기 변경 실패 (기존 수집 ${running ? '유지' : '없음'})`, String(e));
    return false;
  }
}

export async function stopBackgroundTracking(): Promise<void> {
  if (await isBackgroundTrackingOn()) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  stopSatelliteUpdates();
  void stopActivityUpdates();
  appliedIntervalSec = null;
  await Storage.setItem(WANT_TRACKING_KEY, 'off');
}

/** 지금 걸려 있는 수집 주기(초). 설정 화면에서 보여 줍니다 */
export const currentIntervalSec = () => appliedIntervalSec;
