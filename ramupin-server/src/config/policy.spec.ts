import { describe, expect, it } from 'vitest';

import { mergePolicy, policyNumber } from './policy.js';

/**
 * 관리자가 사람별로 바꾼 값을 등급 정책 위에 덮는 규칙.
 *
 * 09-21 에 발견한 문제입니다. 관리자 화면에서 `features.overseasMap` 하나만 켰더니
 * `features` 묶음이 통째로 그 한 개로 바뀌어 프리미엄 지도·과속 경고가 모두 꺼졌습니다.
 * 안전 기능이 조용히 꺼지는 종류라, 규칙을 여기에 고정합니다.
 */

const base = {
  gpsIntervalMovingSec: 15,
  gpsIntervalStillSec: 60,
  photoStorageMb: 300,
  ads: 'banner+fullscreen',
  features: { premiumMap: true, overseasMap: false, speedingAlert: true, governmentEmergency: true },
};

describe('정책 덮어쓰기', () => {
  it('예외가 없으면 등급 정책 그대로', () => {
    expect(mergePolicy(base, {})).toEqual(base);
  });

  it('바꾼 항목만 바뀐다', () => {
    expect(mergePolicy(base, { gpsIntervalStillSec: 30 }).gpsIntervalStillSec).toBe(30);
    expect(mergePolicy(base, { gpsIntervalStillSec: 30 }).photoStorageMb).toBe(300);
  });

  it('기능 하나만 켜도 나머지 기능이 살아 있다', () => {
    const merged = mergePolicy(base, { features: { overseasMap: true } });
    expect(merged.features).toEqual({
      premiumMap: true,
      overseasMap: true,
      speedingAlert: true,
      governmentEmergency: true,
    });
  });

  it('기능 하나를 꺼도 나머지는 그대로', () => {
    const merged = mergePolicy(base, { features: { speedingAlert: false } }) as { features: Record<string, boolean> };
    expect(merged.features.speedingAlert).toBe(false);
    expect(merged.features.premiumMap).toBe(true);
  });

  it('원본을 건드리지 않는다', () => {
    mergePolicy(base, { features: { overseasMap: true } });
    expect(base.features.overseasMap).toBe(false);
  });

  it('배열은 통째로 바꾼다 (섞지 않음)', () => {
    const merged = mergePolicy({ list: [1, 2, 3] }, { list: [9] });
    expect(merged.list).toEqual([9]);
  });

  it('null 로 지우는 것도 그대로 반영', () => {
    expect(mergePolicy({ a: { b: 1 } }, { a: null }).a).toBeNull();
  });
});

describe('정책 숫자 읽기', () => {
  it('값이 있으면 그 값', () => {
    expect(policyNumber({ sosRecipientLimit: 5 }, 'sosRecipientLimit', 1)).toBe(5);
  });

  it('0 도 값으로 인정한다 (사진 공유 불가 등급)', () => {
    expect(policyNumber({ photoStorageMb: 0 }, 'photoStorageMb', 300)).toBe(0);
  });

  it('없거나 숫자가 아니면 기본값', () => {
    expect(policyNumber({}, 'sosRecipientLimit', 1)).toBe(1);
    expect(policyNumber({ sosRecipientLimit: '5' }, 'sosRecipientLimit', 1)).toBe(1);
  });
});
