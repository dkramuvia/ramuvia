/**
 * GPS 감도 (WBS 2.6): 좋음 30m 이하 / 중간 100m 이하 / 나쁨 그 이상.
 * 감도가 나쁠수록 내 위치 둘레의 원이 커집니다.
 * TODO(정책): 기준 거리는 서버 정책값으로 교체 ("거리는 차후 수정가능")
 */
export type GpsSignal = 'good' | 'fair' | 'poor';

const GOOD_MAX_M = 30;
const FAIR_MAX_M = 100;

export function gpsSignal(accuracyM: number | null): GpsSignal {
  if (accuracyM == null) return 'poor';
  if (accuracyM <= GOOD_MAX_M) return 'good';
  if (accuracyM <= FAIR_MAX_M) return 'fair';
  return 'poor';
}

/**
 * 이동 수단 추정 (WBS 5.1): 사람 4~5km / 자전거 15~25km / 자동차 60~150km / 기차 180~250km / 비행기 800~900km
 * TODO(정책): 기준 속도는 서버 정책값·사용자 설정으로 교체
 */
export type MoveMode = 'stay' | 'walk' | 'bike' | 'car' | 'train' | 'plane';

export function moveMode(speedKmh: number | null): MoveMode {
  if (speedKmh == null || speedKmh < 1) return 'stay';
  if (speedKmh < 10) return 'walk';
  if (speedKmh < 40) return 'bike';
  if (speedKmh < 170) return 'car';
  if (speedKmh < 400) return 'train';
  return 'plane';
}
