import * as Location from 'expo-location';

import type { ActivityStatus, ActivityType } from '../../../modules/ramupin-gps';

/**
 * 적응형 위치 수집 (GPS 보고서, WBS 2.4).
 *
 * 왜 필요한가: 지금까지는 30초 고정이었습니다. 가만히 앉아 있어도 30초마다 GPS를 켜니
 * 배터리를 계속 먹고, 반대로 차를 타고 이동할 때는 30초가 너무 길어 경로가 뚝뚝 끊깁니다.
 * 상황에 따라 주기와 정확도를 바꿉니다.
 *
 * 우선순위: SOS > 지오펜스 근접 > 조회 중 > 저배터리 > 이동 > 정지
 */

export type MoveState = 'sos' | 'geofence' | 'watched' | 'lowBattery' | 'moving' | 'still';

/**
 * 상태별 기본 주기(초)와 정확도.
 * TODO(정책): 서버 정책값으로 교체 (WBS 2.1). 지금은 GPS 보고서의 권장값입니다.
 */
export const ADAPTIVE: Record<MoveState, { intervalSec: number; accuracy: Location.LocationAccuracy }> = {
  // 긴급: 가장 촘촘하게, 가장 정확하게
  sos: { intervalSec: 2, accuracy: Location.Accuracy.BestForNavigation },
  // 안심 장소 근처: 진입·이탈을 놓치지 않게
  geofence: { intervalSec: 5, accuracy: Location.Accuracy.High },
  // 지금 누가 내 지도를 보고 있음 (GPS 보고서 2-1 6번).
  // 보는 사람이 있을 때만 촘촘하게 하고, 안 보면 바로 되돌아갑니다
  watched: { intervalSec: 5, accuracy: Location.Accuracy.High },
  // 배터리가 얼마 안 남았으면 아껴서
  lowBattery: { intervalSec: 300, accuracy: Location.Accuracy.Balanced },
  // 이동 중: 경로가 끊기지 않을 만큼 (등급 정책값을 상한으로 씀)
  moving: { intervalSec: 20, accuracy: Location.Accuracy.High },
  // 머무는 중. 실제 주기는 서버 정책값(gpsIntervalStillSec, 09-18 기준 60초)을 씁니다.
  // 여기 숫자는 정책을 못 받았을 때의 대비값입니다.
  //
  // High 로 두는 이유 — 09-18 같은 자리에서 우선순위만 바꿔 실측:
  //   Balanced: 15초를 요청해도 실제로는 3~6분에 한 번. 오차 100m
  //   High    : 17초 간격으로 꾸준히 (23건 연속). 오차 평균 8m
  // 안드로이드는 폰이 안 움직이면 저전력으로 요청한 위치를 무시합니다. High 로 요청해야 이 제한이 풀립니다.
  // 오차 100m 로는 이상징후의 "50m 안에 머물면 고정" 판정도 성립하지 않습니다.
  //
  // High = "GPS 켜기"가 아닙니다. 실내 실측에서 35건 모두 위성 0개였고, 측위는 Wi-Fi 가 했습니다.
  // 배터리 통계에도 이 앱 몫 GPS 전력은 잡히지 않습니다 (웨이크락·Wi-Fi 가 대부분).
  // 밖에서 위성이 잡히면 그때 GPS 가 동원되므로, 15초로 하루 돌려 본 배터리 측정은 따로 필요합니다
  still: { intervalSec: 60, accuracy: Location.Accuracy.High },
};

/** 이 속도(km/h) 이상이면 이동 중으로 봅니다 (활동 인식이 없을 때만 씀) */
const MOVING_SPEED_KMH = 3;
/**
 * 이 값 이하면 저전력 모드 (충전 중이면 해당 없음).
 * 정책을 못 받았을 때의 대비값입니다. GPS 보고서 2-1: 20%
 */
const DEFAULT_LOW_BATTERY_PERCENT = 20;

/** 활동 인식 결과를 믿을 만한 최소 확신도 (0~100) */
const MIN_ACTIVITY_CONFIDENCE = 50;
/** 확실히 어딘가로 가고 있는 활동 (집안에서는 나오지 않습니다) */
const TRAVEL_ACTIVITIES = new Set<ActivityType>(['running', 'bicycle', 'vehicle']);

/**
 * 기준점(머물던 자리)에서 이만큼 떨어져야 "밖으로 나갔다"로 봅니다.
 *
 * 집안에서 화장실·부엌을 오가는 것도 활동 인식은 '걷기'로 잡습니다.
 * 그것까지 이동으로 치면 하루 종일 촘촘하게 수집해 버리므로, 자리를 실제로 벗어났는지 같이 봅니다.
 * 이상징후의 "한자리에 머묾" 판정 반경과 같은 값입니다 (서버 ANOMALY_RULES.fixedRadiusM).
 */
export const STAY_RADIUS_M = 50;

export interface StateInput {
  speedKmh: number | null;
  battery: number | null;
  charging: boolean | null;
  /** 안드로이드 활동 인식 (걷기·차량·정지). 없으면 속도로만 판단 */
  activity?: ActivityStatus | null;
  /** 머물던 기준점에서 떨어진 거리(m). 기준점이 아직 없으면 null */
  distanceFromAnchorM?: number | null;
  /** 저전력으로 내려가는 배터리 기준(%). 서버 정책값 */
  lowBatteryPercent?: number;
  /** SOS 진행 중 (TODO: SOS 화면에서 켜 주기) */
  sos?: boolean;
  /**
   * 안심 장소 반경 근처 (geofenceSnapshot.ts).
   * 들어갔다·나갔다 판정은 서버가 합니다. 폰은 경계를 넘은 시각이 정확해지도록 촘촘하게 모읍니다
   */
  nearGeofence?: boolean;
  /** 지금 누가 내 위치를 보고 있음 (서버가 소켓으로 알려 줍니다) */
  watched?: boolean;
}

export interface StateDecision {
  state: MoveState;
  /**
   * 기준점을 지금 위치로 옮겨야 하는지.
   * 멈춰 있는데 기준점에서 멀다면 = 다른 곳에 도착해서 자리를 잡은 것입니다.
   */
  reanchor: boolean;
}

export function decideState(input: StateInput): StateDecision {
  const { speedKmh, battery, charging, sos, nearGeofence, watched } = input;
  const lowBattery = input.lowBatteryPercent ?? DEFAULT_LOW_BATTERY_PERCENT;
  const movement = judgeMovement(input);
  if (sos) return { state: 'sos', reanchor: false };
  if (nearGeofence) return { state: 'geofence', reanchor: movement.reanchor };
  // 보고 있는 사람이 있으면 배터리보다 실시간성을 앞세웁니다. 안 보면 바로 내려갑니다
  if (watched) return { state: 'watched', reanchor: movement.reanchor };
  // 충전 중이면 배터리를 아낄 이유가 없습니다
  if (!charging && battery != null && battery <= lowBattery) {
    return { state: 'lowBattery', reanchor: movement.reanchor };
  }
  void speedKmh;
  return { state: movement.moving ? 'moving' : 'still', reanchor: movement.reanchor };
}

/**
 * 이동 중인지 판단.
 *
 * 속도만 보면 실내에서 문제가 생깁니다. 09-15·16 실측에서, 책상에 둔 폰이 시속 40km 로 기록됐습니다.
 * 실내 위치는 오차가 3~8m 라 가만히 있어도 속도가 튑니다. 그래서 활동 인식을 먼저 믿습니다 (WBS 2.3).
 *
 * 활동 인식만으로도 부족합니다. 집안을 오가는 것도 '걷기'로 잡히기 때문에,
 * 걷기일 때는 머물던 자리에서 실제로 벗어났는지(STAY_RADIUS_M)를 함께 봅니다.
 */
function judgeMovement({ speedKmh, activity, distanceFromAnchorM }: StateInput): { moving: boolean; reanchor: boolean } {
  // 기준점에서 얼마나 떨어졌는지. 기준점이 없으면 "벗어나지 않음"으로 둡니다
  const left = distanceFromAnchorM != null && distanceFromAnchorM >= STAY_RADIUS_M;

  if (activity && activity.confidence >= MIN_ACTIVITY_CONFIDENCE) {
    // 차·자전거·뛰기는 집안에서 나올 수 없는 활동이라 그대로 믿습니다
    if (TRAVEL_ACTIVITIES.has(activity.type)) return { moving: true, reanchor: false };
    // 걷기: 자리를 벗어났을 때만 이동. 집안을 오가는 것은 머무는 중으로 둡니다
    if (activity.type === 'walking') return { moving: left, reanchor: false };
    // 정지: 멈춰 있습니다. 기준점에서 멀다면 다른 곳에 도착한 것이므로 기준점을 옮깁니다
    if (activity.type === 'still') return { moving: false, reanchor: left };
    // tilting·unknown 은 판단하지 않고 아래 속도로 넘어갑니다
  }

  // 활동 인식이 없는 기기·빌드: 예전처럼 속도로만 판단합니다
  const movingBySpeed = speedKmh != null && speedKmh >= MOVING_SPEED_KMH;
  return { moving: movingBySpeed, reanchor: !movingBySpeed && left };
}

/**
 * 실제로 쓸 주기(초). 값은 모두 서버 정책에서 옵니다 (관리자 페이지에서 변경 예정).
 * 이동 중에는 등급 정책(gpsIntervalMovingSec)이 상한입니다 — 유료 10초, 무료 20초.
 */
export function intervalSecFor(state: MoveState, policy: { gpsIntervalMovingSec: number; gpsIntervalStillSec: number }): number {
  // 이동 중이 정지보다 느려지면 경로가 끊기므로, 정지 주기보다 길어지지 않게 막습니다
  if (state === 'moving') {
    return Math.min(ADAPTIVE.moving.intervalSec, policy.gpsIntervalMovingSec, policy.gpsIntervalStillSec);
  }
  if (state === 'still') return policy.gpsIntervalStillSec;
  return ADAPTIVE[state].intervalSec;
}
