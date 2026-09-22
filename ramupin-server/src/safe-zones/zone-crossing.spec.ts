import { describe, expect, it } from 'vitest';

import { distanceM } from './geo.js';
import { EXIT_MARGIN_M, judgeCrossing, MAX_ACCURACY_M } from './zone-crossing.js';

/** 회사 근처 한 지점을 기준으로 씁니다 */
const CENTER = { latitude: 37.4763, longitude: 126.8879 };
const zone = (inside: boolean, radiusM = 100) => ({ ...CENTER, radiusM, inside });

/** 기준점에서 북쪽으로 미터만큼 떨어진 좌표 */
function north(meters: number) {
  return { latitude: CENTER.latitude + meters / 111_320, longitude: CENTER.longitude };
}

describe('안심장소 진입·이탈 판정', () => {
  it('밖에 있다가 반경 안으로 들어오면 진입', () => {
    expect(judgeCrossing(zone(false), north(50))).toBe('enter');
  });

  it('밖에 있고 계속 밖이면 아무 일 없음', () => {
    expect(judgeCrossing(zone(false), north(300))).toBe(null);
  });

  it('안에 있는 동안 조금 움직여도 아무 일 없음', () => {
    expect(judgeCrossing(zone(true), north(80))).toBe(null);
  });

  it('반경을 넘었어도 여유 안이면 아직 나간 것이 아님', () => {
    // 100m 반경 + 여유 30m. 120m 지점은 아직 "나감"이 아닙니다
    expect(judgeCrossing(zone(true), north(120))).toBe(null);
  });

  it('여유까지 넘어가야 이탈', () => {
    expect(judgeCrossing(zone(true), north(100 + EXIT_MARGIN_M + 20))).toBe('leave');
  });

  /**
   * 이 여유가 없으면, 경계에 앉아 있는 사람의 위치가 오차로 흔들릴 때마다
   * 친구 폰에 "도착했어요 / 나갔어요" 가 번갈아 울립니다
   */
  it('경계에서 오차만큼 흔들려도 알림이 반복되지 않는다', () => {
    let inside = true;
    const wobble = [95, 105, 98, 112, 103, 99];
    const crossings = wobble.map((m) => {
      const result = judgeCrossing(zone(inside), north(m));
      if (result) inside = result === 'enter';
      return result;
    });
    expect(crossings.every((c) => c === null)).toBe(true);
  });

  it('오차가 너무 큰 위치는 판정에 쓰지 않는다', () => {
    expect(judgeCrossing(zone(false), { ...north(50), accuracy: MAX_ACCURACY_M + 1 })).toBe(null);
    // 같은 자리라도 오차가 작으면 판정합니다
    expect(judgeCrossing(zone(false), { ...north(50), accuracy: 20 })).toBe('enter');
  });

  it('오차를 모르는 위치는 믿고 씁니다 (옛 앱 버전 대비)', () => {
    expect(judgeCrossing(zone(false), { ...north(50), accuracy: null })).toBe('enter');
  });
});

describe('거리 계산', () => {
  it('북쪽으로 100m 는 약 100m 로 나온다', () => {
    expect(distanceM(CENTER, north(100))).toBeGreaterThan(99);
    expect(distanceM(CENTER, north(100))).toBeLessThan(101);
  });

  it('같은 자리는 0', () => {
    expect(distanceM(CENTER, CENTER)).toBe(0);
  });
});
