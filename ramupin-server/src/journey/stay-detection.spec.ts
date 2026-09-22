import { describe, expect, it } from 'vitest';

import { buildJourney, MIN_STAY_MINUTES, type Point } from './stay-detection.js';

const HOME = { latitude: 37.4786, longitude: 126.8776 };
const OFFICE = { latitude: 37.4845, longitude: 126.8966 };

const base = new Date('2026-09-22T00:00:00+09:00').getTime();
/** 분 단위로 점 하나 */
const at = (minutes: number, coord: { latitude: number; longitude: number }, jitterM = 0): Point => ({
  latitude: coord.latitude + jitterM / 111_320,
  longitude: coord.longitude,
  measuredAt: new Date(base + minutes * 60_000),
});

/** 한 자리에 머무는 동안 1분마다 찍힌 점들 (실제 수집과 같은 주기) */
function staying(fromMin: number, toMin: number, coord: { latitude: number; longitude: number }): Point[] {
  const points: Point[] = [];
  // 실내 위치는 몇 m 씩 흔들립니다. 그래도 한 자리로 묶여야 합니다
  for (let m = fromMin; m <= toMin; m += 1) points.push(at(m, coord, (m % 5) * 2));
  return points;
}

/** 두 지점 사이를 걸어가는 동안 찍힌 점들 */
function moving(fromMin: number, toMin: number, from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }): Point[] {
  const points: Point[] = [];
  const steps = toMin - fromMin;
  for (let i = 1; i < steps; i += 1) {
    const ratio = i / steps;
    points.push({
      latitude: from.latitude + (to.latitude - from.latitude) * ratio,
      longitude: from.longitude + (to.longitude - from.longitude) * ratio,
      measuredAt: new Date(base + (fromMin + i) * 60_000),
    });
  }
  return points;
}

describe('하루 여정 만들기', () => {
  it('집에 있다가 회사로 이동해 머물면 머문 곳 2개', () => {
    const points = [...staying(0, 540, HOME), ...moving(540, 580, HOME, OFFICE), ...staying(580, 1080, OFFICE)];
    const journey = buildJourney(points);

    expect(journey.stops).toHaveLength(2);
    expect(journey.stops[0].leftAt).toBeTruthy();
    // 마지막 장소는 아직 그 자리에 있는 것이라 떠난 시각이 없습니다
    expect(journey.stops[1].leftAt).toBeUndefined();
    expect(journey.stops[1].movedMinutesBefore).toBeGreaterThan(35);
    expect(journey.stops[1].movedMinutesBefore).toBeLessThan(45);
  });

  it('이동 구간은 한 줄로 이어진다', () => {
    const points = [...staying(0, 60, HOME), ...moving(60, 100, HOME, OFFICE), ...staying(100, 200, OFFICE)];
    const kinds = buildJourney(points).route.map((r) => r.kind);
    // 머묾 → 이동 → 머묾. 이동이 여러 토막으로 끊기면 지도에 점선처럼 보입니다
    expect(kinds).toEqual(['stay', 'move', 'stay']);
  });

  it('신호 대기처럼 잠깐 선 것은 머문 곳이 아니다', () => {
    const CROSS = { latitude: 37.4818, longitude: 126.8826 };
    const points = [
      ...staying(0, 60, HOME),
      ...moving(60, 70, HOME, CROSS),
      // 교차로에서 2분 (MIN_STAY_MINUTES 미만)
      ...staying(70, 72, CROSS),
      ...moving(72, 90, CROSS, OFFICE),
      ...staying(90, 200, OFFICE),
    ];
    const journey = buildJourney(points);
    expect(journey.stops).toHaveLength(2);
    expect(MIN_STAY_MINUTES).toBeGreaterThan(2);
  });

  it('실내에서 몇 m 씩 흔들려도 한 자리로 묶인다', () => {
    // 09-17 실측: 4시간 동안 270건, 서로 다른 좌표 4개 (약 2m 안)
    const journey = buildJourney(staying(0, 240, HOME));
    expect(journey.stops).toHaveLength(1);
    expect(journey.route).toHaveLength(1);
  });

  it('하루 종일 이동만 하면 머문 곳이 없다', () => {
    const journey = buildJourney(moving(0, 120, HOME, OFFICE));
    expect(journey.stops).toHaveLength(0);
    expect(journey.route.every((r) => r.kind === 'move')).toBe(true);
  });

  it('점이 없으면 빈 여정', () => {
    expect(buildJourney([])).toEqual({ stops: [], route: [], totalDistanceM: 0 });
  });

  it('이동 거리를 잰다', () => {
    const journey = buildJourney([...staying(0, 30, HOME), ...moving(30, 70, HOME, OFFICE), ...staying(70, 120, OFFICE)]);
    // 집~회사 직선이 약 1.8km. 머무는 동안의 흔들림이 더해지므로 그 이상
    expect(journey.totalDistanceM).toBeGreaterThan(1500);
    expect(journey.totalDistanceM).toBeLessThan(4000);
  });

  it('순서가 뒤섞여 들어와도 시간순으로 정리한다', () => {
    const points = [...staying(0, 60, HOME), ...moving(60, 100, HOME, OFFICE), ...staying(100, 200, OFFICE)];
    const shuffled = [...points].reverse();
    expect(buildJourney(shuffled).stops).toEqual(buildJourney(points).stops);
  });
});
