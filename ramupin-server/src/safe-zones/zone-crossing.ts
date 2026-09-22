import { distanceM } from './geo.js';

/**
 * 안심장소를 드나들었는지 판정 (WBS 9.4).
 *
 * 그냥 "반경 안이면 진입, 밖이면 이탈" 로 하면 안 됩니다.
 * 경계에 앉아 있으면 위치 오차(실외 10~30m)만으로 들어왔다 나갔다가 반복되고,
 * 그때마다 친구 폰에 알림이 울립니다. 그래서 두 가지를 둡니다.
 *
 *   1. **나갈 때는 더 멀리 가야 인정** (히스테리시스). 들어오는 선과 나가는 선을 다르게 둡니다
 *   2. **오차가 큰 위치는 판정에 쓰지 않음**. 오차 200m 짜리 위치로는 반경 100m 안팎을 가릴 수 없습니다
 */

/** 나갈 때 더 가야 하는 여유(m). 위치 오차로 경계에서 들락거리는 것을 막습니다 */
export const EXIT_MARGIN_M = 30;
/** 이 값(m)보다 오차가 크면 판정하지 않고 넘깁니다 */
export const MAX_ACCURACY_M = 100;

export interface ZoneShape {
  latitude: number;
  longitude: number;
  radiusM: number;
  /** 직전까지 안에 있었는지 */
  inside: boolean;
}

export interface Fix {
  latitude: number;
  longitude: number;
  /** 위치 오차(m). 모르면 null — 그때는 믿고 씁니다 */
  accuracy?: number | null;
}

/** 'enter' = 지금 들어옴 / 'leave' = 지금 나감 / null = 달라진 것 없음 */
export type Crossing = 'enter' | 'leave' | null;

export function judgeCrossing(zone: ZoneShape, fix: Fix): Crossing {
  if (fix.accuracy != null && fix.accuracy > MAX_ACCURACY_M) return null;

  const d = distanceM(zone, fix);
  if (!zone.inside) return d <= zone.radiusM ? 'enter' : null;
  // 안에 있던 상태: 반경보다 여유만큼 더 나가야 "나갔다" 로 봅니다
  return d > zone.radiusM + EXIT_MARGIN_M ? 'leave' : null;
}
