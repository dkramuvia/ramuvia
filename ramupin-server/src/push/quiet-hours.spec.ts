import { describe, expect, it } from 'vitest';

import { inQuietHours, localHhmm } from './notification-settings.service.js';

/**
 * 방해 금지 시간 판정.
 *
 * `23:00~05:00` 처럼 **자정을 넘기는 구간**이 흔합니다. "시작 이상이고 끝 미만" 으로만
 * 보면 정작 밤에 안 걸립니다. 여기서 그 경우를 못 잡으면 새벽에 알림이 갑니다.
 */

/** 서울 기준 그 시각의 UTC 순간 */
const seoul = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(2026, 8, 30, h - 9, m));
};

describe('inQuietHours', () => {
  describe('자정을 넘기는 구간 (23:00~05:00)', () => {
    const cases: [string, boolean][] = [
      ['22:59', false],
      ['23:00', true], // 시작은 포함
      ['23:30', true],
      ['00:00', true], // 자정 너머
      ['04:59', true],
      ['05:00', false], // 끝은 제외
      ['12:00', false],
    ];
    for (const [time, expected] of cases) {
      it(`${time} → ${expected ? '금지 중' : '보내도 됨'}`, () => {
        expect(inQuietHours('23:00', '05:00', 'Asia/Seoul', seoul(time))).toBe(expected);
      });
    }
  });

  describe('같은 날 안의 구간 (13:00~15:00)', () => {
    const cases: [string, boolean][] = [
      ['12:59', false],
      ['13:00', true],
      ['14:30', true],
      ['15:00', false],
      ['23:00', false],
    ];
    for (const [time, expected] of cases) {
      it(`${time} → ${expected ? '금지 중' : '보내도 됨'}`, () => {
        expect(inQuietHours('13:00', '15:00', 'Asia/Seoul', seoul(time))).toBe(expected);
      });
    }
  });

  it('시작과 끝이 같으면 구간이 없는 것으로 봅니다', () => {
    // 하루 종일 금지는 실수일 가능성이 큽니다. 알림이 통째로 멈추면 안전 앱으로서 위험합니다
    expect(inQuietHours('23:00', '23:00', 'Asia/Seoul', seoul('23:00'))).toBe(false);
    expect(inQuietHours('23:00', '23:00', 'Asia/Seoul', seoul('04:00'))).toBe(false);
  });

  it('DB 가 돌려주는 `23:00:00` 꼴도 받습니다', () => {
    expect(inQuietHours('23:00:00', '05:00:00', 'Asia/Seoul', seoul('23:30'))).toBe(true);
  });

  it('시간대가 다르면 판정도 달라집니다', () => {
    // 서울 23:30 은 런던 15:30 입니다. 런던에 있는 사람은 아직 금지 시간이 아닙니다
    const moment = seoul('23:30');
    expect(inQuietHours('23:00', '05:00', 'Asia/Seoul', moment)).toBe(true);
    expect(inQuietHours('23:00', '05:00', 'Europe/London', moment)).toBe(false);
  });

  it('시간대 이름이 잘못돼 있어도 멈추지 않습니다 (서울로 봄)', () => {
    // 알림이 통째로 안 가는 것보다 낫습니다
    expect(localHhmm(seoul('23:30'), '엉뚱한값')).toBe('23:30');
  });
});
