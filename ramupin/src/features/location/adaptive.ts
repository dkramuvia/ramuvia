import * as Location from 'expo-location';

import type { ActivityStatus, ActivityType } from '../../../modules/ramupin-gps';

/**
 * 적응형 위치 수집 (GPS 보고서, WBS 2.4).
 *
 * 왜 필요한가: 지금까지는 30초 고정이었습니다. 가만히 앉아 있어도 30초마다 GPS를 켜니
 * 배터리를 계속 먹고, 반대로 차를 타고 이동할 때는 30초가 너무 길어 경로가 뚝뚝 끊깁니다.
 * 상황에 따라 주기와 정확도를 바꿉니다.
 *
 * 우선순위: SOS > 관리자 강제 > 지오펜스 근접 > 저배터리 > 이동 > 정지
 */

export type MoveState = 'sos' | 'geofence' | 'lowBattery' | 'moving' | 'still';

/**
 * 상태별 기본 주기(초)와 정확도.
 * TODO(정책): 서버 정책값으로 교체 (WBS 2.1). 지금은 GPS 보고서의 권장값입니다.
 */
export const ADAPTIVE: Record<MoveState, { intervalSec: number; accuracy: Location.LocationAccuracy }> = {
  // 긴급: 가장 촘촘하게, 가장 정확하게
  sos: { intervalSec: 2, accuracy: Location.Accuracy.BestForNavigation },
  // 안심 장소 근처: 진입·이탈을 놓치지 않게
  geofence: { intervalSec: 5, accuracy: Location.Accuracy.High },
  // 배터리가 얼마 안 남았으면 아껴서
  lowBattery: { intervalSec: 300, accuracy: Location.Accuracy.Balanced },
  // 이동 중: 경로가 끊기지 않을 만큼 (등급 정책값을 상한으로 씀)
  moving: { intervalSec: 20, accuracy: Location.Accuracy.High },
  // 머무는 중: 자리를 지키는지만 알면 되므로 느슨하게.
  // 09-17 실측: Balanced 는 오차 100m, High 는 3~4m. 배터리를 재 본 뒤 조정 필요 (docs 참고)
  still: { intervalSec: 180, accuracy: Location.Accuracy.Balanced },
};

/** 이 속도(km/h) 이상이면 이동 중으로 봅니다 */
const MOVING_SPEED_KMH = 3;
/** 이 값 이하면 저전력 모드 (충전 중이면 해당 없음) */
const LOW_BATTERY_PERCENT = 15;

/** 활동 인식 결과를 믿을 만한 최소 확신도 (0~100) */
const MIN_ACTIVITY_CONFIDENCE = 50;
/** 이동 중으로 보는 활동 */
const MOVING_ACTIVITIES = new Set<ActivityType>(['walking', 'running', 'bicycle', 'vehicle']);

export interface StateInput {
  speedKmh: number | null;
  battery: number | null;
  charging: boolean | null;
  /** 안드로이드 활동 인식 (걷기·차량·정지). 없으면 속도로만 판단 */
  activity?: ActivityStatus | null;
  /** SOS 진행 중 (TODO: SOS 화면에서 켜 주기) */
  sos?: boolean;
  /** 안심 장소 반경 근처 (TODO: 지오펜스 붙일 때) */
  nearGeofence?: boolean;
}

export function decideState({ speedKmh, battery, charging, activity, sos, nearGeofence }: StateInput): MoveState {
  if (sos) return 'sos';
  if (nearGeofence) return 'geofence';
  // 충전 중이면 배터리를 아낄 이유가 없습니다
  if (!charging && battery != null && battery <= LOW_BATTERY_PERCENT) return 'lowBattery';
  return isMoving(speedKmh, activity) ? 'moving' : 'still';
}

/**
 * 이동 중인지 판단.
 *
 * 속도만 보면 실내에서 문제가 생깁니다. 실내 위치는 오차가 커서 속도가 잘 안 잡히고,
 * 반대로 오차 때문에 가만히 있어도 속도가 튀어 오르기도 합니다.
 * 안드로이드 활동 인식이 있으면 그쪽을 먼저 믿습니다 (WBS 2.3).
 */
function isMoving(speedKmh: number | null, activity?: ActivityStatus | null): boolean {
  if (activity && activity.confidence >= MIN_ACTIVITY_CONFIDENCE) {
    if (MOVING_ACTIVITIES.has(activity.type)) return true;
    if (activity.type === 'still') return false;
    // tilting·unknown 은 판단하지 않고 속도로 넘어갑니다
  }
  return speedKmh != null && speedKmh >= MOVING_SPEED_KMH;
}

/**
 * 실제로 쓸 주기(초).
 * 이동 중에는 등급 정책(gpsIntervalMovingSec)이 상한입니다.
 * 유료 등급은 10초, 무료는 20초처럼 등급이 높을수록 촘촘해집니다.
 */
export function intervalSecFor(state: MoveState, policyMovingSec: number): number {
  if (state === 'moving') return Math.min(ADAPTIVE.moving.intervalSec, policyMovingSec);
  return ADAPTIVE[state].intervalSec;
}
