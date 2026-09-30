import { describe, expect, it } from 'vitest';

import { canNotifyAgain, peakSpeed, speedingSeconds, speedingStage, type SpeedPoint } from './speeding.js';

/**
 * 과속 판정.
 *
 * 여기서 헐겁게 잡으면 **가짜 경고가 쌓여 사람들이 알림을 꺼 버립니다.**
 * GPS 속도는 터널·고가도로에서 순간적으로 튑니다.
 */

const 초전 = (n: number) => new Date(Date.UTC(2026, 8, 30, 12, 0, 0) - n * 1000);

/** `[초 전, 속도]` 로 점을 만듭니다 */
const points = (pairs: [number, number | null][]): SpeedPoint[] =>
  pairs.map(([ago, speedKmh]) => ({ speedKmh, measuredAt: 초전(ago) }));

describe('speedingSeconds', () => {
  it('지금 과속 중이 아니면 0', () => {
    expect(speedingSeconds(points([[60, 160], [30, 160], [0, 80]]))).toBe(0);
  });

  it('이어서 넘은 시간만 셉니다', () => {
    // 90초 전부터 계속 160km/h
    expect(speedingSeconds(points([[90, 160], [60, 160], [30, 160], [0, 160]]))).toBe(90);
  });

  it('중간에 기준 아래로 내려가면 거기서 끊깁니다', () => {
    // 90초 전 과속 → 60초 전 정상 → 그 뒤 다시 과속. 30초만 셉니다
    expect(speedingSeconds(points([[90, 160], [60, 80], [30, 160], [0, 160]]))).toBe(30);
  });

  it('한 점만 튄 것은 거의 0초입니다', () => {
    expect(speedingSeconds(points([[60, 70], [30, 70], [0, 220]]))).toBe(0);
  });

  it('속도를 모르는 점은 끊는 것으로 봅니다', () => {
    // 속도가 없는 점은 "과속 중이었다" 는 근거가 못 됩니다
    expect(speedingSeconds(points([[90, 160], [60, null], [30, 160], [0, 160]]))).toBe(30);
  });

  it('점이 없으면 0', () => {
    expect(speedingSeconds([])).toBe(0);
  });

  it('순서가 뒤섞여 들어와도 시간 순으로 봅니다', () => {
    expect(speedingSeconds(points([[0, 160], [90, 160], [30, 160], [60, 160]]))).toBe(90);
  });
});

describe('speedingStage', () => {
  it('짧으면 아무 것도 안 함', () => {
    expect(speedingStage(10)).toBe('none');
  });
  it('30초 넘으면 본인 경고', () => {
    expect(speedingStage(30)).toBe('warn');
    expect(speedingStage(119)).toBe('warn');
  });
  it('2분 넘으면 보호자에게', () => {
    expect(speedingStage(120)).toBe('guardian');
  });
});

describe('canNotifyAgain', () => {
  const now = new Date(Date.UTC(2026, 8, 30, 12, 0, 0));
  it('처음이면 보냅니다', () => {
    expect(canNotifyAgain(null, now)).toBe(true);
  });
  it('방금 보냈으면 안 보냅니다', () => {
    // 고속도로를 계속 달리는 동안 내내 울리면 안 됩니다
    expect(canNotifyAgain(new Date(now.getTime() - 60_000), now)).toBe(false);
  });
  it('충분히 지났으면 다시 보냅니다', () => {
    expect(canNotifyAgain(new Date(now.getTime() - 11 * 60_000), now)).toBe(true);
  });
});

describe('peakSpeed', () => {
  it('가장 빨랐던 값', () => {
    expect(peakSpeed(points([[60, 160], [30, 185], [0, 170]]))).toBe(185);
  });
  it('속도를 모르는 점이 섞여도 됩니다', () => {
    expect(peakSpeed(points([[60, null], [0, 160]]))).toBe(160);
  });
});
