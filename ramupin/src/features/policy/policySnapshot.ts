import Storage from 'expo-sqlite/kv-store';

import type { PlanPolicy } from './policies';

/**
 * 백그라운드 수집이 쓰는 정책 사본.
 *
 * 등급 정책은 서버에서 받아 react-query 에 담아 두는데, 안드로이드가 앱을 백그라운드에서 깨울 때는
 * 화면이 없어 그 캐시가 비어 있습니다. 그래서 필요한 숫자만 기기에 따로 저장해 둡니다 (WBS 2.1: 수치 하드코딩 금지).
 */

const KEY = 'policy-snapshot';

export interface PolicySnapshot {
  /** 이동 중 위치 확인 주기(초) */
  gpsIntervalMovingSec: number;
  /** 머무는 중 위치 확인 주기(초) */
  gpsIntervalStillSec: number;
  /** 모아서 서버로 보내는 주기(초) */
  uploadIntervalSec: number;
  /** 이 값(%) 이하면 저전력 수집 */
  lowBatteryPercent: number;
  /** 이동 중 최소 이동 거리(m). 0 이면 시간만 봅니다 */
  moveDistanceM: number;
}

/** 서버 정책을 아직 못 받았을 때 쓰는 값 (베이직 등급 기준) */
export const DEFAULT_SNAPSHOT: PolicySnapshot = {
  gpsIntervalMovingSec: 15,
  gpsIntervalStillSec: 60,
  uploadIntervalSec: 60,
  lowBatteryPercent: 20,
  moveDistanceM: 75,
};

export async function savePolicySnapshot(policy: PlanPolicy): Promise<void> {
  const snapshot: PolicySnapshot = {
    gpsIntervalMovingSec: policy.gpsIntervalMovingSec,
    gpsIntervalStillSec: policy.gpsIntervalStillSec,
    uploadIntervalSec: policy.uploadIntervalSec,
    lowBatteryPercent: policy.lowBatteryPercent,
    moveDistanceM: policy.moveDistanceM,
  };
  try {
    await Storage.setItem(KEY, JSON.stringify(snapshot));
  } catch (error) {
    console.warn('[policy] 사본 저장 실패', String(error));
  }
}

export async function loadPolicySnapshot(): Promise<PolicySnapshot> {
  try {
    const raw = await Storage.getItem(KEY);
    if (!raw) return DEFAULT_SNAPSHOT;
    const parsed = JSON.parse(raw) as Partial<PolicySnapshot>;
    const positive = (v: unknown, fallback: number) => (typeof v === 'number' && v > 0 ? v : fallback);
    return {
      gpsIntervalMovingSec: positive(parsed.gpsIntervalMovingSec, DEFAULT_SNAPSHOT.gpsIntervalMovingSec),
      gpsIntervalStillSec: positive(parsed.gpsIntervalStillSec, DEFAULT_SNAPSHOT.gpsIntervalStillSec),
      uploadIntervalSec: positive(parsed.uploadIntervalSec, DEFAULT_SNAPSHOT.uploadIntervalSec),
      lowBatteryPercent: positive(parsed.lowBatteryPercent, DEFAULT_SNAPSHOT.lowBatteryPercent),
      // 0 을 허용해야 "거리 조건 끄기" 가 됩니다
      moveDistanceM: typeof parsed.moveDistanceM === 'number' && parsed.moveDistanceM >= 0 ? parsed.moveDistanceM : DEFAULT_SNAPSHOT.moveDistanceM,
    };
  } catch {
    return DEFAULT_SNAPSHOT;
  }
}
