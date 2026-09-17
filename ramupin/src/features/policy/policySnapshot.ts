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
  /** 이동 중 위치 전송 최대 주기(초) */
  gpsIntervalMovingSec: number;
}

/** 서버 정책을 아직 못 받았을 때 쓰는 값 (베이직 등급 기준) */
export const DEFAULT_SNAPSHOT: PolicySnapshot = { gpsIntervalMovingSec: 20 };

export async function savePolicySnapshot(policy: PlanPolicy): Promise<void> {
  const snapshot: PolicySnapshot = { gpsIntervalMovingSec: policy.gpsIntervalMovingSec };
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
    const interval = parsed.gpsIntervalMovingSec;
    return typeof interval === 'number' && interval > 0 ? { gpsIntervalMovingSec: interval } : DEFAULT_SNAPSHOT;
  } catch {
    return DEFAULT_SNAPSHOT;
  }
}
