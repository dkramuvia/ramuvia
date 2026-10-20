import type { ColumnType, Generated } from 'kysely';

/** 위치 DB (ramupin_location) 테이블 타입. migrations/location 과 맞춰 수정하세요. */
export interface LocationPointsTable {
  user_id: string;
  measured_at: ColumnType<Date, Date | string, never>;
  received_at: Generated<Date>;
  /** [위도, 경도] AES-256-GCM (common/location-crypto.ts). 평문 좌표는 두지 않습니다 */
  coords_enc: Buffer | null;
  /** 암호화 이전 평문 칸. 기존 행을 옮기는 동안만 남아 있고 새 행에는 넣지 않습니다 (migrations/location/0006) */
  latitude: number | null;
  longitude: number | null;
  geog: ColumnType<string | null, unknown, unknown>;
  altitude: number | null;
  accuracy: number | null;
  altitude_accuracy: number | null;
  speed: number | null;
  heading: number | null;
  provider: string | null;
  satellites: number | null;
  signal_strength: number | null;
  battery: number | null;
  /** 측정 시점에 충전 중이었는지 (이상징후 판정, docs/anomaly-alerts.md) */
  charging: boolean | null;
  /** 안드로이드 활동 인식: still / walking / running / bicycle / vehicle (WBS 2.3) */
  activity: string | null;
  state: string | null;
}

export interface LocationAccessLogsTable {
  id: Generated<string>;
  subject_user_id: string;
  viewer_user_id: string | null;
  purpose: string;
  accessed_at: Generated<Date>;
}

/** 이상징후 판정에 쓰는 사용자별 마지막 상태 (docs/anomaly-alerts.md) */
export interface UserStatusTable {
  user_id: string;
  last_measured_at: Date;
  /** 마지막 위치 [위도, 경도] 암호화 */
  last_coords_enc: Buffer | null;
  /** 머물기 시작한 기준점 [위도, 경도] 암호화 */
  anchor_coords_enc: Buffer | null;
  /** 암호화 이전 평문 칸 (migrations/location/0006). 새 값은 넣지 않습니다 */
  last_latitude: number | null;
  last_longitude: number | null;
  last_battery: number | null;
  last_charging: boolean | null;
  /** 지금 자리에 머물기 시작한 기준점과 시각 (반경 밖으로 나가면 새로 잡음) */
  fixed_anchor_latitude: number | null;
  fixed_anchor_longitude: number | null;
  fixed_since: Date;
  /** 배터리가 0% 가 된 시각 (0% 를 벗어나면 null) */
  battery_zero_since: Date | null;
  updated_at: Generated<Date>;
}

export interface LocationDatabase {
  'location.location_points': LocationPointsTable;
  'location.location_access_logs': LocationAccessLogsTable;
  'location.user_status': UserStatusTable;
}
