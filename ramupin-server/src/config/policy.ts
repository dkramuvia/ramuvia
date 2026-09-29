import type { MainDb } from '../database/main-database.module.js';

/**
 * 이 사용자에게 적용되는 정책값 (등급 정책 + 관리자가 사람별로 바꾼 값).
 *
 * 쓰는 곳이 여러 군데(정책 API·사진 용량·SOS 수신인 수)라 한 곳에 둡니다.
 */

export type Policy = Record<string, unknown>;

export async function resolvePolicy(db: MainDb, userId: string): Promise<Policy & { planId: string }> {
  const row = await db
    .selectFrom('member.users as u')
    .innerJoin('config.plan_policies as p', 'p.plan', 'u.plan')
    .leftJoin('config.user_policy_overrides as o', 'o.user_id', 'u.id')
    .select(['u.plan', 'p.policy as base', 'o.policy as override'])
    .where('u.id', '=', userId)
    .executeTakeFirst();
  if (!row) return { planId: 'basic' };
  return { planId: row.plan, ...mergePolicy(row.base, row.override ?? {}) };
}

/**
 * 사람별 예외를 등급 정책 위에 덮습니다.
 *
 * 그냥 펼쳐서 합치면(`{...base, ...override}`) 안쪽 묶음이 통째로 갈립니다.
 * 예: 관리자가 `features.overseasMap` 하나만 켰는데 `features` 전체가 그 한 개로 바뀌어
 * premiumMap 같은 나머지 기능이 모두 사라집니다. 그래서 한 단계 더 들어가서 합칩니다.
 */
export function mergePolicy(base: Policy, override: Policy): Policy {
  const merged: Policy = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = merged[key];
    if (isPlainObject(current) && isPlainObject(value)) merged[key] = mergePolicy(current, value);
    else merged[key] = value;
  }
  return merged;
}

/** 배열과 null 은 통째로 바꿔야 하므로 순수 객체만 골라냅니다 */
function isPlainObject(value: unknown): value is Policy {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 정책에서 숫자 하나. 값이 없거나 숫자가 아니면 기본값 */
export function policyNumber(policy: Policy, key: string, fallback: number): number {
  const value = policy[key];
  return typeof value === 'number' ? value : fallback;
}

/**
 * 정책의 기능 스위치 하나 (`features.speedingAlert`).
 * 값이 없으면 **꺼진 것으로 봅니다** — 모르는 기능을 켜 주는 쪽이 더 위험합니다.
 */
export function policyFeature(policy: Policy, key: string): boolean {
  const features = policy.features;
  if (!isPlainObject(features)) return false;
  return features[key] === true;
}
