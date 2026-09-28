// 경로선 색(노랑=머무름, 파랑=이동)은 지도 위에서 뜻을 나타내는 색이라
// 라이트·다크 어느 쪽에서도 같습니다. 테마를 따라가면 오히려 뜻이 흐려집니다
import { colors } from '@/theme';
import type { JourneyDay, LatLng } from '@/types/models';
import type { MapPolylineItem } from '@/features/map/AppMapView';

/** 기획: 노란 줄 = 정체(머무름), 파란 줄 = 이동 */
export function routePolylines(journey: JourneyDay): MapPolylineItem[] {
  return journey.route.map((segment, i) => ({
    id: `seg-${i}`,
    coordinates: segment.coordinates,
    color: segment.kind === 'stay' ? colors.routeStay : colors.routeMove,
    width: segment.kind === 'stay' ? 8 : 6,
  }));
}

export function allRouteCoordinates(journey: JourneyDay): LatLng[] {
  return journey.route.flatMap((s) => s.coordinates);
}

/** 205 → "3시간 25분", 45 → "45분" */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

export function minutesSince(iso: string, until = Date.now()): number {
  return Math.max(0, Math.round((until - new Date(iso).getTime()) / 60_000));
}
