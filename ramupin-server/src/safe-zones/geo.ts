/**
 * 두 좌표 사이 거리(m). 하버사인.
 *
 * 앱에도 같은 계산이 있습니다 (src/features/location/geo.ts).
 * 판정을 서버가 하고 앱은 "근처인가" 만 보므로 조금 달라도 문제되지 않지만,
 * 값이 어긋나면 원인을 찾기 어려워 같은 식을 씁니다.
 */

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export function distanceM(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}
