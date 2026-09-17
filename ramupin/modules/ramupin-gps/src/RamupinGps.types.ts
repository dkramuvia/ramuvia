/** 위성 상태 (WBS 2.3) */
export interface SatelliteStatus {
  /** 하늘에서 보이는 위성 수 */
  satellitesVisible: number;
  /** 실제로 내 위치 계산에 쓰인 위성 수. 실내에서는 0 일 수 있습니다 */
  satellitesUsed: number;
  /** 쓰인 위성들의 평균 신호 세기 (dB-Hz). 30 이상이면 좋은 편, 못 받았으면 null */
  signalStrength: number | null;
}

/** 지금 켜져 있는 위치 제공자 (WBS 2.2) */
export interface EnabledProviders {
  /** GPS 위성 */
  gps: boolean;
  /** 기지국·Wi-Fi 기반 */
  network: boolean;
}

/** 지금 무엇을 하고 있는지 (WBS 2.3, 8.6) */
export type ActivityType = 'still' | 'walking' | 'running' | 'bicycle' | 'vehicle' | 'tilting' | 'unknown';

export interface ActivityStatus {
  type: ActivityType;
  /** 0~100. 낮으면 안드로이드도 확신하지 못한다는 뜻이라 그대로 믿으면 안 됩니다 */
  confidence: number;
  /** 감지 시각 (epoch ms) */
  detectedAt: number;
}
