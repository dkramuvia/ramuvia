import { describe, expect, it } from 'vitest';

import { decidePlan } from './sign-up.service.js';

/** 시험 기준 시각을 고정합니다. "오늘"에 따라 결과가 달라지면 안 됩니다 */
const NOW = new Date('2026-09-22T12:00:00+09:00');

describe('노인 무료 등급 판정', () => {
  it('소셜이 확인해 준 출생연도가 있으면 그것으로 정한다', () => {
    // 본인은 1990년생이라고 적었지만 네이버가 1945년생으로 확인해 준 경우
    const result = decidePlan(1945, '1990-01-01', NOW);
    expect(result.age).toBe(81);
    expect(result.plan).toBe('care');
    expect(result.ageVerified).toBe(true);
  });

  /** 이것을 막지 못하면 아무나 무료로 유료 등급을 씁니다 */
  it('확인된 연도가 있으면 본인이 적은 나이로는 무료 등급을 받을 수 없다', () => {
    // 1950년생이라고 적었지만 카카오가 1995년생으로 확인해 준 경우
    const result = decidePlan(1995, '1950-01-01', NOW);
    expect(result.age).toBe(31);
    expect(result.plan).toBe('basic');
    expect(result.mismatch).toBe(true);
  });

  it('확인 항목이 없는 소셜(구글·X)이면 본인이 적은 값을 쓴다', () => {
    expect(decidePlan(null, '1945-01-01', NOW)).toMatchObject({ plan: 'care', ageVerified: false });
    expect(decidePlan(null, '1995-01-01', NOW)).toMatchObject({ plan: 'basic', ageVerified: false });
  });

  it('생일이 아직 안 지나 한 살 차이 나는 것은 어긋난 것으로 보지 않는다', () => {
    // 1945-12-31 생은 오늘(9월) 기준 80세. 연도 차이로는 81
    expect(decidePlan(1945, '1945-12-31', NOW).mismatch).toBe(false);
  });

  it('기준 나이 경계', () => {
    expect(decidePlan(2026 - 75, '2000-01-01', NOW).plan).toBe('care');
    expect(decidePlan(2026 - 74, '2000-01-01', NOW).plan).toBe('basic');
  });

  it('생년월일이 이상하면 나이를 알 수 없고 무료 등급도 아니다', () => {
    expect(decidePlan(null, '얼렁뚱땅', NOW)).toMatchObject({ age: null, plan: 'basic' });
  });
});
