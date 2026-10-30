import type { LatLng } from '@/types/models';

/** 핀 하나가 화면에서 차지하는 폭(dp). 이보다 가까우면 겹쳐 보입니다 */
const PIN_WIDTH_DP = 56;

/** 1도 위도의 길이(m) */
const M_PER_DEG_LAT = 111_320;

/** 두 좌표 사이 거리(m). 핀이 겹치는지 보는 데는 평면 근사로 충분합니다 */
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = (b.latitude - a.latitude) * M_PER_DEG_LAT;
  const dLng = (b.longitude - a.longitude) * M_PER_DEG_LAT * Math.cos(((a.latitude + b.latitude) / 2) * (Math.PI / 180));
  return Math.hypot(dLat, dLng);
}

/**
 * 지금 확대 정도에서 핀이 겹치는 거리(m).
 * @param latitudeDelta 화면에 보이는 위도 범위
 * @param mapHeightDp 지도 높이
 */
export function overlapDistanceM(latitudeDelta: number, mapHeightDp: number): number {
  return ((latitudeDelta * M_PER_DEG_LAT) / Math.max(mapHeightDp, 1)) * PIN_WIDTH_DP;
}

/**
 * 겹치는 사람끼리 묶습니다 (대표 리포트 78, 10-30 대표님 확정: "3명" 으로 묶고 누르면 펼침).
 * 앞 사람부터 기준을 잡고 그 반경 안의 사람을 모읍니다. 친구 수가 적어 이 정도로 충분합니다.
 * 혼자인 사람도 한 묶음(길이 1)으로 돌려줍니다.
 */
export function clusterByDistance<T extends { coordinate: LatLng }>(items: T[], thresholdM: number): T[][] {
  const groups: T[][] = [];
  const used = new Set<number>();
  items.forEach((seed, i) => {
    if (used.has(i)) return;
    used.add(i);
    const group = [seed];
    items.forEach((other, j) => {
      if (used.has(j) || distanceM(seed.coordinate, other.coordinate) > thresholdM) return;
      used.add(j);
      group.push(other);
    });
    groups.push(group);
  });
  return groups;
}

/** 묶음 가운데 */
export function centerOf(coords: LatLng[]): LatLng {
  const sum = coords.reduce((acc, c) => ({ latitude: acc.latitude + c.latitude, longitude: acc.longitude + c.longitude }), { latitude: 0, longitude: 0 });
  return { latitude: sum.latitude / coords.length, longitude: sum.longitude / coords.length };
}

/** 묶음 안에서 가장 먼 두 사람 사이 거리(m). 거의 같은 자리면 확대해도 안 갈라집니다 */
export function spreadM(coords: LatLng[]): number {
  let max = 0;
  for (let i = 0; i < coords.length; i++) {
    for (let j = i + 1; j < coords.length; j++) max = Math.max(max, distanceM(coords[i], coords[j]));
  }
  return max;
}
