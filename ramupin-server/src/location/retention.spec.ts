import { describe, expect, it } from 'vitest';

/**
 * 위치 파기 기준 (WBS 4.3, 위치정보법).
 *
 * **되돌릴 수 없는 작업입니다.** 하루 늦게 지우는 것은 괜찮지만 하루 일찍 지우면
 * 있어야 할 기록이 사라지고 복구할 방법이 없습니다. 그래서 경계를 여기에 고정합니다.
 *
 * 파티션은 월 단위라 "6개월 보관" 은 **이번 달 기준 6개월 전 달까지 남긴다**는 뜻입니다.
 */

/** drop_expired_partitions() 와 같은 판단: 파티션 달이 기준 달보다 이르면 버립니다 */
function shouldDrop(partitionMonth: string, now: Date, keepMonths: number): boolean {
  if (keepMonths <= 0) return false;
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - keepMonths, 1));
  const year = Number(partitionMonth.slice(0, 4));
  const month = Number(partitionMonth.slice(4, 6));
  return new Date(Date.UTC(year, month - 1, 1)) < cutoff;
}

const NOW = new Date('2026-09-22T00:00:00Z');

describe('위치 파기 기준 (6개월)', () => {
  it('이번 달은 남긴다', () => {
    expect(shouldDrop('202609', NOW, 6)).toBe(false);
  });

  it('6개월 전 달까지 남긴다 (경계)', () => {
    // 2026-09 기준 6개월 전 = 2026-03. 이 달은 남습니다
    expect(shouldDrop('202603', NOW, 6)).toBe(false);
  });

  it('7개월 전 달부터 버린다 (경계)', () => {
    expect(shouldDrop('202602', NOW, 6)).toBe(true);
  });

  it('아주 오래된 달은 버린다', () => {
    expect(shouldDrop('202401', NOW, 6)).toBe(true);
  });

  it('해가 바뀌어도 맞다', () => {
    const jan = new Date('2027-01-15T00:00:00Z');
    expect(shouldDrop('202607', jan, 6)).toBe(false); // 6개월 전
    expect(shouldDrop('202606', jan, 6)).toBe(true); // 7개월 전
  });

  /**
   * 법무 확인 결과에 따라 기간이 바뀔 수 있어 값으로 뺐습니다.
   * 규칙은 기간과 무관하게 같습니다 — N개월 전 달은 남기고, N+1개월 전부터 버립니다.
   */
  it('보관 기간을 12개월로 늘리면 그만큼 남는다', () => {
    expect(shouldDrop('202509', NOW, 12)).toBe(false); // 12개월 전 = 경계, 남김
    expect(shouldDrop('202508', NOW, 12)).toBe(true); // 13개월 전, 버림
  });

  /**
   * 개발 PC 에서 실수로 지우지 않도록 0 이면 아무것도 버리지 않습니다.
   * 설정을 빼먹었을 때 "전부 삭제" 가 되는 쪽보다 "아무것도 안 함" 쪽이 안전합니다.
   */
  it('0 개월이면 아무것도 버리지 않는다', () => {
    expect(shouldDrop('202001', NOW, 0)).toBe(false);
  });
});
