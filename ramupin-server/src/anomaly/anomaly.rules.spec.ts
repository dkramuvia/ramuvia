import { describe, expect, it } from 'vitest';

import { detect, distanceM, stageFor, ANOMALY_RULES, type StatusSnapshot } from './anomaly.rules.js';

const NOW = new Date('2026-09-17T12:00:00Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

/** 기본: 방금 위치를 받았고, 방금 움직였고, 배터리 80% */
const base: StatusSnapshot = {
  lastMeasuredAt: minutesAgo(1),
  lastBattery: 80,
  lastCharging: false,
  fixedSince: minutesAgo(1),
  batteryZeroSince: null,
};

describe('stageFor', () => {
  it('아직 첫 단계에 못 미치면 null', () => {
    expect(stageFor(ANOMALY_RULES.gpsFixed, 60)).toBeNull();
  });

  it('지난 시간에 해당하는 가장 높은 단계를 고른다', () => {
    expect(stageFor(ANOMALY_RULES.gpsFixed, 12 * 60)).toBe('12h');
    expect(stageFor(ANOMALY_RULES.gpsFixed, 23 * 60)).toBe('12h');
    expect(stageFor(ANOMALY_RULES.gpsFixed, 24 * 60)).toBe('24h');
    expect(stageFor(ANOMALY_RULES.gpsFixed, 100 * 60)).toBe('48h');
  });
});

describe('distanceM', () => {
  it('같은 점은 0m', () => {
    expect(distanceM(37.5, 127.0, 37.5, 127.0)).toBe(0);
  });

  it('위도 0.001도 ≈ 111m', () => {
    expect(distanceM(37.5, 127.0, 37.501, 127.0)).toBeGreaterThan(100);
    expect(distanceM(37.5, 127.0, 37.501, 127.0)).toBeLessThan(120);
  });

  it('고정 판정 반경(50m) 안팎을 구분한다', () => {
    // 위도 0.0003도 ≈ 33m
    expect(distanceM(37.5, 127.0, 37.5003, 127.0)).toBeLessThan(ANOMALY_RULES.fixedRadiusM);
    // 위도 0.0008도 ≈ 89m
    expect(distanceM(37.5, 127.0, 37.5008, 127.0)).toBeGreaterThan(ANOMALY_RULES.fixedRadiusM);
  });
});

describe('detect - 정상', () => {
  it('방금 움직이고 배터리도 넉넉하면 아무것도 없다', () => {
    expect(detect(base, NOW)).toEqual([]);
  });

  it('11시간만 고정이면 아직 알리지 않는다', () => {
    expect(detect({ ...base, fixedSince: minutesAgo(11 * 60) }, NOW)).toEqual([]);
  });
});

describe('detect - 배터리 트랙 (A·B)', () => {
  it('10% 이하면 부족 알림', () => {
    expect(detect({ ...base, lastBattery: 9 }, NOW)).toEqual([{ track: 'battery', stage: 'low' }]);
  });

  it('11% 는 알리지 않는다', () => {
    expect(detect({ ...base, lastBattery: 11 }, NOW)).toEqual([]);
  });

  it('0% 가 되면 zero, 3시간 지나면 3h', () => {
    expect(detect({ ...base, lastBattery: 0, batteryZeroSince: minutesAgo(1) }, NOW)).toEqual([{ track: 'battery', stage: 'zero' }]);
    expect(detect({ ...base, lastBattery: 0, batteryZeroSince: minutesAgo(3 * 60) }, NOW)).toEqual([{ track: 'battery', stage: '3h' }]);
  });

  it('0% 일 때는 부족(low) 알림을 겹쳐 보내지 않는다', () => {
    const found = detect({ ...base, lastBattery: 0, batteryZeroSince: minutesAgo(60) }, NOW);
    expect(found.filter((f) => f.stage === 'low')).toEqual([]);
  });
});

describe('detect - 위치 고정 트랙 (C·D)', () => {
  it('12시간 고정이면 알린다', () => {
    expect(detect({ ...base, fixedSince: minutesAgo(12 * 60) }, NOW)).toEqual([{ track: 'gps_fixed', stage: '12h' }]);
  });

  it('48시간이면 48h', () => {
    expect(detect({ ...base, fixedSince: minutesAgo(50 * 60) }, NOW)).toEqual([{ track: 'gps_fixed', stage: '48h' }]);
  });
});

describe('detect - 조합 트랙', () => {
  it('고정 + 배터리 0% 는 최우선 조합으로 한 번만 알린다 (E·F)', () => {
    const found = detect(
      { ...base, lastBattery: 0, batteryZeroSince: minutesAgo(13 * 60), fixedSince: minutesAgo(13 * 60) },
      NOW,
    );
    expect(found).toEqual([{ track: 'fixed_battery_zero', stage: '12h' }]);
  });

  it('고정 + 충전 100% 는 충전 트랙 (G·H)', () => {
    const found = detect({ ...base, lastBattery: 100, lastCharging: true, fixedSince: minutesAgo(13 * 60) }, NOW);
    expect(found).toEqual([{ track: 'fixed_charging', stage: '12h' }]);
  });

  it('충전 중이어도 100% 가 아니면 그냥 위치 고정', () => {
    const found = detect({ ...base, lastBattery: 70, lastCharging: true, fixedSince: minutesAgo(13 * 60) }, NOW);
    expect(found).toEqual([{ track: 'gps_fixed', stage: '12h' }]);
  });
});

describe('detect - 신호 두절 트랙 (I·J)', () => {
  it('마지막 배터리가 넉넉하면 신호 두절로 본다', () => {
    const found = detect({ ...base, lastMeasuredAt: minutesAgo(40), lastBattery: 100 }, NOW);
    expect(found).toEqual([{ track: 'no_signal', stage: '30m' }]);
  });

  it('마지막 배터리가 20% 미만이면 배터리 트랙으로 보낸다 (09-17 확정)', () => {
    const found = detect({ ...base, lastMeasuredAt: minutesAgo(4 * 60), lastBattery: 15 }, NOW);
    expect(found).toEqual([{ track: 'battery', stage: '3h' }]);
  });

  it('20% 는 신호 두절 쪽 (경계값)', () => {
    const found = detect({ ...base, lastMeasuredAt: minutesAgo(40), lastBattery: 20 }, NOW);
    expect(found).toEqual([{ track: 'no_signal', stage: '30m' }]);
  });

  it('신호가 끊긴 동안에는 위치 고정을 함께 세지 않는다 (옛날 좌표라서)', () => {
    const found = detect(
      { ...base, lastMeasuredAt: minutesAgo(13 * 60), lastBattery: 100, fixedSince: minutesAgo(30 * 60) },
      NOW,
    );
    expect(found).toEqual([{ track: 'no_signal', stage: '12h' }]);
  });

  it('29분은 아직 두절로 보지 않는다', () => {
    expect(detect({ ...base, lastMeasuredAt: minutesAgo(29) }, NOW)).toEqual([]);
  });
});
