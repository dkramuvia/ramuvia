import { describe, expect, it } from 'vitest';

import { ANOMALY_RULES, detect } from './anomaly.rules.js';

/**
 * 감시가 "누구를 볼지" 고르는 기준 (2026-09-22).
 *
 * 전에는 5분마다 전 사용자를 읽었습니다. 100만 대면 하루 2.9억 행이라 감당이 안 돼,
 * 조건에 해당하는 사람만 인덱스로 골라 오도록 바꿨습니다.
 *
 * **고르는 조건이 판정 조건보다 좁으면 이상징후를 놓칩니다.** 조용히 안 잡히는 종류라
 * 규칙을 바꿀 때 같이 안 바꾸면 위험합니다. 그래서 여기에 고정합니다.
 */

/** location.service.ts 의 SWEEP_THRESHOLDS 와 같은 계산 */
const thresholds = {
  noSignalMinutes: ANOMALY_RULES.noSignal[0].afterMinutes,
  fixedMinutes: ANOMALY_RULES.gpsFixed[0].afterMinutes,
  lowBatteryPercent: ANOMALY_RULES.lowBatteryPercent,
};

/** 경계·시계 오차 대비 여유 (location.service.ts 의 FETCH_MARGIN_MS 와 같은 값) */
const FETCH_MARGIN_MS = 60_000;

/** listStatusesToCheck 의 WHERE 조건과 같은 판단 */
function wouldFetch(status: Status, now: Date): boolean {
  const ms = now.getTime() + FETCH_MARGIN_MS;
  return (
    status.lastMeasuredAt.getTime() < ms - thresholds.noSignalMinutes * 60_000 ||
    status.fixedSince.getTime() < ms - thresholds.fixedMinutes * 60_000 ||
    status.batteryZeroSince !== null ||
    (status.lastBattery !== null && status.lastBattery <= thresholds.lowBatteryPercent)
  );
}

interface Status {
  userId: string;
  lastMeasuredAt: Date;
  lastBattery: number | null;
  lastCharging: boolean | null;
  fixedSince: Date;
  batteryZeroSince: Date | null;
  lastLatitude: number;
  lastLongitude: number;
}

const NOW = new Date('2026-09-22T12:00:00Z');
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

function status(over: Partial<Status> = {}): Status {
  return {
    userId: 'u1',
    lastMeasuredAt: ago(1),
    lastBattery: 80,
    lastCharging: false,
    fixedSince: ago(10),
    batteryZeroSince: null,
    lastLatitude: 37.4763,
    lastLongitude: 126.8879,
    ...over,
  };
}

describe('감시 대상 고르기', () => {
  it('경계값(정확히 30분)도 가져온다 — 여유를 두는 이유', () => {
    const s = status({ lastMeasuredAt: ago(30) });
    expect(detect(s, NOW).length).toBeGreaterThan(0);
    expect(wouldFetch(s, NOW)).toBe(true);
  });

  it('아무 문제 없는 사람은 가져오지 않는다', () => {
    const s = status();
    expect(detect(s, NOW)).toEqual([]);
    expect(wouldFetch(s, NOW)).toBe(false);
  });

  it('신호 두절 1단계(30분)를 가져온다', () => {
    const s = status({ lastMeasuredAt: ago(31) });
    expect(detect(s, NOW).length).toBeGreaterThan(0);
    expect(wouldFetch(s, NOW)).toBe(true);
  });

  it('위치 고정 1단계(12시간)를 가져온다', () => {
    const s = status({ fixedSince: ago(12 * 60 + 1) });
    expect(detect(s, NOW).length).toBeGreaterThan(0);
    expect(wouldFetch(s, NOW)).toBe(true);
  });

  it('배터리 0% 를 가져온다', () => {
    const s = status({ lastBattery: 0, batteryZeroSince: ago(5) });
    expect(detect(s, NOW).length).toBeGreaterThan(0);
    expect(wouldFetch(s, NOW)).toBe(true);
  });

  it('배터리 부족(10%)을 가져온다', () => {
    const s = status({ lastBattery: ANOMALY_RULES.lowBatteryPercent });
    expect(detect(s, NOW).length).toBeGreaterThan(0);
    expect(wouldFetch(s, NOW)).toBe(true);
  });

  /**
   * 핵심 검사. 판정에 걸리는 상태인데 가져오지 않으면 그 사람은 영영 안 잡힙니다.
   * 경계값을 촘촘히 넣어 규칙이 바뀌어도 어긋남을 잡도록 했습니다.
   */
  it('판정에 걸리는 상태는 반드시 가져온다', () => {
    const cases: Status[] = [];
    for (const m of [29, 30, 31, 60, 180, 12 * 60, 24 * 60, 48 * 60, 72 * 60]) {
      cases.push(status({ lastMeasuredAt: ago(m) }));
      cases.push(status({ lastMeasuredAt: ago(m), lastBattery: 15 }));
      cases.push(status({ fixedSince: ago(m) }));
      cases.push(status({ fixedSince: ago(m), lastBattery: 100, lastCharging: true }));
      cases.push(status({ fixedSince: ago(m), lastBattery: 0, batteryZeroSince: ago(m) }));
    }
    for (const b of [0, 1, 5, 9, 10, 11, 20, 50, 100]) cases.push(status({ lastBattery: b }));

    const missed = cases.filter((s) => detect(s, NOW).length > 0 && !wouldFetch(s, NOW));
    expect(missed, `놓치는 상태 ${missed.length}건 — 고르는 조건이 판정보다 좁습니다`).toEqual([]);
  });
});
