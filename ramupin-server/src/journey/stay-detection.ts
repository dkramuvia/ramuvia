import { distanceM } from '../safe-zones/geo.js';

/**
 * 하루치 위치를 "머문 곳"과 "이동"으로 나눕니다 (WBS 4.5, 기획 '최근 여정').
 *
 * 왜 필요한가: 하루에 1,800건이 쌓이는데, 사람이 보고 싶은 것은
 * "집에 9시까지 있다가, 회사로 40분 이동해서, 6시까지 있었다" 한 줄입니다.
 * 점 1,800개를 그대로 보여 주면 아무것도 읽히지 않습니다.
 *
 * 이 함수는 위치 보관 방식 결정(docs/decision-data-retention.md)의 "나. 요약 보관"과
 * **같은 계산**입니다. 대표님이 요약 보관으로 결정하시면 이 함수를 그대로 저장에 씁니다.
 */

/** 이 반경(m) 안에서 맴돌면 "같은 자리에 있다" 로 봅니다 */
export const STAY_RADIUS_M = 50;
/** 이 시간(분)을 넘겨야 "머물렀다" 로 칩니다. 신호 대기 정도는 머문 것이 아닙니다 */
export const MIN_STAY_MINUTES = 5;
/**
 * 정확도(m)가 이보다 나쁜 점은 버립니다.
 * 대표 리포트 63: 실내에서 기지국으로 잡힌 점이 수백 m 씩 튀어, 같은 주소에 있었는데 하루 3.4km 를 이동한 것으로 나왔습니다
 */
export const MAX_ACCURACY_M = 100;
/** 이동 거리는 이만큼(m) 넘게 움직였을 때만 셉니다. 제자리 흔들림이 쌓여 거리가 되는 것을 막습니다 */
export const MIN_MOVE_M = 30;
/** 대표 리포트 82: 이 반경(m) 안의 머문 곳 두 개가 짧은 이동으로만 갈라져 있으면 하나로 합칩니다 */
export const MERGE_STAY_RADIUS_M = 100;
/** 그 짧은 이동의 최대 길이(분) */
export const MERGE_GAP_MINUTES = 5;

export interface Point {
  latitude: number;
  longitude: number;
  measuredAt: Date;
  /** 측정 정확도(m). 모르면 비움 */
  accuracy?: number | null;
}

export interface Stop {
  latitude: number;
  longitude: number;
  arrivedAt: string;
  /** 없으면 지금도 머무는 중 */
  leftAt?: string;
  /** 이 장소에 오기까지 이동한 시간(분) */
  movedMinutesBefore?: number;
}

export interface RouteSegment {
  kind: 'move' | 'stay';
  coordinates: { latitude: number; longitude: number }[];
}

export interface Journey {
  stops: Stop[];
  route: RouteSegment[];
  totalDistanceM: number;
}

/**
 * 점들을 시간순으로 훑으면서, 기준점에서 반경 안에 머무는 동안을 한 덩어리로 묶습니다.
 *
 * 기준점을 무리의 평균이 아니라 **첫 점**으로 두는 이유: 평균을 쓰면 천천히 걸을 때
 * 기준점이 같이 끌려가면서 한 시간 걸은 것도 "한자리에 머묾"이 됩니다.
 */
export function buildJourney(points: Point[]): Journey {
  const accurate = points.filter((p) => p.accuracy == null || p.accuracy <= MAX_ACCURACY_M);
  // 전부 부정확하면(실내에만 있던 날) 아무것도 안 보이는 것보다 있는 그대로가 낫습니다
  const usable = accurate.length > 0 ? accurate : points;
  const sorted = [...usable].sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime());
  if (sorted.length === 0) return { stops: [], route: [], totalDistanceM: 0 };

  const clusters = groupIntoClusters(sorted);

  const stops: Stop[] = [];
  const route: RouteSegment[] = [];
  let lastLeftAt: Date | null = null;

  for (const cluster of clusters) {
    const coordinates = cluster.points.map(toCoord);
    if (!cluster.stayed) {
      route.push({ kind: 'move', coordinates });
      continue;
    }

    const first = cluster.points[0];
    const last = cluster.points[cluster.points.length - 1];
    const stop: Stop = {
      latitude: first.latitude,
      longitude: first.longitude,
      arrivedAt: first.measuredAt.toISOString(),
      // 마지막 무리는 아직 그 자리에 있는 것이므로 leftAt 을 비웁니다
      ...(cluster.isLast ? {} : { leftAt: last.measuredAt.toISOString() }),
    };
    if (lastLeftAt) {
      stop.movedMinutesBefore = Math.max(0, Math.round((first.measuredAt.getTime() - lastLeftAt.getTime()) / 60_000));
    }
    stops.push(stop);
    route.push({ kind: 'stay', coordinates });
    lastLeftAt = last.measuredAt;
  }

  return { stops, route, totalDistanceM: Math.round(totalDistance(sorted)) };
}

interface Cluster {
  points: Point[];
  /** 반경 안에서 충분히 오래 있었는지 */
  stayed: boolean;
  isLast: boolean;
}

function groupIntoClusters(sorted: Point[]): Cluster[] {
  const clusters: { points: Point[]; stayed: boolean }[] = [];
  let anchor = sorted[0];
  let current: Point[] = [anchor];

  const close = (points: Point[]) => {
    const minutes = (points[points.length - 1].measuredAt.getTime() - points[0].measuredAt.getTime()) / 60_000;
    clusters.push({ points, stayed: minutes >= MIN_STAY_MINUTES });
  };

  for (const point of sorted.slice(1)) {
    if (distanceM(anchor, point) <= STAY_RADIUS_M) {
      current.push(point);
      continue;
    }
    close(current);
    anchor = point;
    current = [point];
  }
  close(current);

  // 머물지 않은 덩어리가 연달아 나오면 한 번의 이동입니다. 붙여서 선이 끊기지 않게 합니다
  const merged: { points: Point[]; stayed: boolean }[] = [];
  for (const cluster of clusters) {
    const prev = merged[merged.length - 1];
    if (prev && !prev.stayed && !cluster.stayed) prev.points.push(...cluster.points);
    else merged.push(cluster);
  }

  return mergeNearbyStays(merged).map((c, i) => ({ ...c, isLast: i === merged.length - 1 }));
}

/**
 * 가까운 머문 곳 두 개가 바로 붙어 있거나 짧은 이동(5분 미만)으로만 갈라져 있으면 하나로 합칩니다.
 * 대표 리포트 82: 반경 50m 를 살짝 벗어난 흔들림 때문에 같은 주소가 히스토리에 여러 번 나열됐습니다
 */
function mergeNearbyStays(clusters: { points: Point[]; stayed: boolean }[]) {
  const out: { points: Point[]; stayed: boolean }[] = [];
  for (const cluster of clusters) {
    if (cluster.stayed) {
      const last = out[out.length - 1];
      const gap = last && !last.stayed ? last : null;
      const prevStay = gap ? out[out.length - 2] : last;
      const gapMinutes = prevStay
        ? (cluster.points[0].measuredAt.getTime() - prevStay.points[prevStay.points.length - 1].measuredAt.getTime()) / 60_000
        : Infinity;
      if (prevStay?.stayed && gapMinutes < MERGE_GAP_MINUTES && distanceM(prevStay.points[0], cluster.points[0]) <= MERGE_STAY_RADIUS_M) {
        if (gap) {
          prevStay.points.push(...gap.points);
          out.pop();
        }
        prevStay.points.push(...cluster.points);
        continue;
      }
    }
    out.push(cluster);
  }
  return out;
}

/**
 * 이동 거리. 마지막으로 센 점에서 max(두 점의 정확도, 30m) 를 넘게 벗어났을 때만 더합니다.
 * 바로 앞 점과만 비교하면 천천히 걸을 때 한 칸씩은 늘 30m 미만이라 거리가 0 이 됩니다
 */
function totalDistance(points: Point[]): number {
  if (points.length === 0) return 0;
  let sum = 0;
  let anchor = points[0];
  for (const point of points.slice(1)) {
    const d = distanceM(anchor, point);
    if (d > Math.max(anchor.accuracy ?? 0, point.accuracy ?? 0, MIN_MOVE_M)) {
      sum += d;
      anchor = point;
    }
  }
  return sum;
}

const toCoord = (p: Point) => ({ latitude: p.latitude, longitude: p.longitude });
