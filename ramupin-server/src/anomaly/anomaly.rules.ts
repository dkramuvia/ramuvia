/**
 * 이상징후 판정 규칙 (docs/anomaly-alerts.md).
 *
 * 여기 숫자는 전부 기본값입니다. WBS 2.1(수치 하드코딩 금지)에 따라
 * 관리자 화면에서 바꿀 수 있어야 하므로, 나중에 정책 테이블에서 읽도록 바꿉니다.
 * TODO(관리자 웹): ANOMALY_RULES 를 DB 정책값으로 교체
 */

/** 트랙 = 무엇을 보고 판단하는가 */
export type AnomalyTrack =
  /** A·B 배터리 */
  | 'battery'
  /** C·D 위치 고정 */
  | 'gps_fixed'
  /** E·F 위치 고정 + 배터리 0% (최우선) */
  | 'fixed_battery_zero'
  /** G·H 위치 고정 + 충전 중 */
  | 'fixed_charging'
  /** I·J 신호 두절 */
  | 'no_signal';

/** 알림을 어디로 보내는가 */
export type AnomalyTarget = 'friends' | 'monitoring';

export interface AnomalyStage {
  /** 기록에 남는 단계 이름 */
  stage: string;
  /** 이 시간(분)을 넘으면 이 단계 */
  afterMinutes: number;
}

export const ANOMALY_RULES = {
  /** 위치가 이 반경(m) 안에 있으면 "안 움직였다" (09-17 확정: 실내 GPS 오차 100m 를 고려) */
  fixedRadiusM: 50,
  /** 배터리가 이 값 이하면 "부족" 알림 (WBS 9.1) */
  lowBatteryPercent: 10,
  /**
   * 신호가 끊겼을 때 마지막 배터리가 이 값 미만이면 배터리 트랙으로 봅니다 (09-17 확정).
   * 자연 방전으로 설명되므로 최우선 위험군(신호 두절)에서 뺍니다.
   */
  noSignalMinBatteryPercent: 20,

  /** 배터리 0% 가 지속된 시간 */
  battery: [
    { stage: 'zero', afterMinutes: 0 },
    { stage: '3h', afterMinutes: 3 * 60 },
    { stage: '12h', afterMinutes: 12 * 60 },
    { stage: '24h', afterMinutes: 24 * 60 },
    { stage: '48h', afterMinutes: 48 * 60 },
  ] satisfies AnomalyStage[],

  /** 한 자리에 머문 시간 (야간 제외 없음 — 09-17 확정) */
  gpsFixed: [
    { stage: '12h', afterMinutes: 12 * 60 },
    { stage: '24h', afterMinutes: 24 * 60 },
    { stage: '48h', afterMinutes: 48 * 60 },
  ] satisfies AnomalyStage[],

  /** 신호가 끊긴 시간 */
  noSignal: [
    { stage: '30m', afterMinutes: 30 },
    { stage: '3h', afterMinutes: 3 * 60 },
    { stage: '12h', afterMinutes: 12 * 60 },
    { stage: '24h', afterMinutes: 24 * 60 },
    { stage: '48h', afterMinutes: 48 * 60 },
  ] satisfies AnomalyStage[],
} as const;

/** 지난 시간으로 지금 몇 단계인지. 아직 첫 단계도 안 되면 null */
export function stageFor(stages: readonly AnomalyStage[], elapsedMinutes: number): string | null {
  let current: string | null = null;
  for (const s of stages) {
    if (elapsedMinutes >= s.afterMinutes) current = s.stage;
  }
  return current;
}

/** 두 점 사이 거리(m). 짧은 거리라 단순 평면 근사로 충분합니다 */
export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const EARTH_R = 6_371_000;
  const toRad = Math.PI / 180;
  const dLat = (bLat - aLat) * toRad;
  const dLng = (bLng - aLng) * toRad * Math.cos(((aLat + bLat) / 2) * toRad);
  return Math.sqrt(dLat * dLat + dLng * dLng) * EARTH_R;
}

export interface StatusSnapshot {
  lastMeasuredAt: Date;
  lastBattery: number | null;
  lastCharging: boolean | null;
  fixedSince: Date;
  batteryZeroSince: Date | null;
}

export interface Detection {
  track: AnomalyTrack;
  stage: string;
}

/**
 * 지금 이 사용자에게 열려 있어야 하는 이상징후를 모두 구합니다.
 *
 * 규칙:
 * - 신호가 끊겼으면(마지막 수신이 오래됨) 위치·배터리는 옛날 값이라 "고정"으로 세지 않습니다.
 * - 위치 고정과 배터리 0% 가 겹치면 조합 트랙으로만 봅니다 (단독 트랙 중복 제거).
 */
export function detect(status: StatusSnapshot, now: Date): Detection[] {
  const minutes = (from: Date) => (now.getTime() - from.getTime()) / 60_000;
  const found: Detection[] = [];

  const sinceLastPoint = minutes(status.lastMeasuredAt);
  const battery = status.lastBattery;

  // ── 신호 두절: 마지막 배터리가 20% 이상일 때만. 그보다 낮으면 그냥 방전으로 봅니다
  const noSignalStage = stageFor(ANOMALY_RULES.noSignal, sinceLastPoint);
  if (noSignalStage !== null) {
    if (battery != null && battery >= ANOMALY_RULES.noSignalMinBatteryPercent) {
      return [{ track: 'no_signal', stage: noSignalStage }];
    }
    // 배터리가 낮은 채로 끊겼으면 배터리 트랙으로 넘깁니다.
    // 이때 위치는 옛날 값이라 "고정"을 세지 않습니다
    const batteryStage = stageFor(ANOMALY_RULES.battery, sinceLastPoint);
    return batteryStage ? [{ track: 'battery', stage: batteryStage }] : [];
  }

  // ── 여기부터는 신호가 살아 있는 상태
  const fixedMinutes = minutes(status.fixedSince);
  const fixedStage = stageFor(ANOMALY_RULES.gpsFixed, fixedMinutes);
  const zeroStage = status.batteryZeroSince ? stageFor(ANOMALY_RULES.battery, minutes(status.batteryZeroSince)) : null;

  if (fixedStage && zeroStage) {
    // E·F 최우선 위험군: 못 움직이는데 배터리까지 꺼짐
    found.push({ track: 'fixed_battery_zero', stage: fixedStage });
  } else if (fixedStage && status.lastCharging && battery === 100) {
    // G·H 충전기 꽂은 채 안 움직임
    found.push({ track: 'fixed_charging', stage: fixedStage });
  } else {
    if (fixedStage) found.push({ track: 'gps_fixed', stage: fixedStage });
    if (zeroStage) found.push({ track: 'battery', stage: zeroStage });
  }

  // 배터리 부족(10%)은 단독 정보성 알림
  if (zeroStage === null && battery != null && battery > 0 && battery <= ANOMALY_RULES.lowBatteryPercent) {
    found.push({ track: 'battery', stage: 'low' });
  }

  return found;
}
