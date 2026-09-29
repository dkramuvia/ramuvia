import { describe, expect, it } from 'vitest';

import { distanceM, NEARBY_RADIUS_M } from './nearby.service.js';

/**
 * 근처 판정의 거리 계산.
 *
 * 경도 1도의 길이는 위도에 따라 줄어듭니다 (적도 111km, 서울 약 88km).
 * `cos(위도)` 를 빠뜨리면 동서 방향이 서울에서 1.25배로 나와, 1km 로 잡아도 800m 만 걸립니다.
 */

const 서울 = { lat: 37.4763, lng: 126.8879 };

/** 위도 1도 = 약 111,320m */
const 북쪽으로 = (m: number) => ({ lat: 서울.lat + m / 111_320, lng: 서울.lng });
/** 경도는 cos(위도) 만큼 짧습니다 */
const 동쪽으로 = (m: number) => ({ lat: 서울.lat, lng: 서울.lng + m / (111_320 * Math.cos((서울.lat * Math.PI) / 180)) });

describe('distanceM', () => {
  it('같은 자리는 0', () => {
    expect(distanceM(서울.lat, 서울.lng, 서울.lat, 서울.lng)).toBe(0);
  });

  it('북쪽 500m', () => {
    const p = 북쪽으로(500);
    expect(distanceM(서울.lat, 서울.lng, p.lat, p.lng)).toBeCloseTo(500, 0);
  });

  it('동쪽 500m — 경도 보정이 들어가야 맞습니다', () => {
    const p = 동쪽으로(500);
    expect(distanceM(서울.lat, 서울.lng, p.lat, p.lng)).toBeCloseTo(500, 0);
  });

  it('1km 경계', () => {
    const 안 = 동쪽으로(NEARBY_RADIUS_M - 50);
    const 밖 = 동쪽으로(NEARBY_RADIUS_M + 50);
    expect(distanceM(서울.lat, 서울.lng, 안.lat, 안.lng)).toBeLessThan(NEARBY_RADIUS_M);
    expect(distanceM(서울.lat, 서울.lng, 밖.lat, 밖.lng)).toBeGreaterThan(NEARBY_RADIUS_M);
  });

  it('방향이 반대여도 같은 거리', () => {
    const 북 = 북쪽으로(300);
    const 남 = 북쪽으로(-300);
    expect(distanceM(서울.lat, 서울.lng, 북.lat, 북.lng)).toBeCloseTo(distanceM(서울.lat, 서울.lng, 남.lat, 남.lng), 1);
  });
});
