import type { ColumnType, Generated } from 'kysely';

/** 위치 DB (ramupin_location) 테이블 타입. migrations/location 과 맞춰 수정하세요. */
export interface LocationPointsTable {
  user_id: string;
  measured_at: ColumnType<Date, Date | string, never>;
  received_at: Generated<Date>;
  /** 위도·경도·고도를 칸마다 AES-256-GCM 으로 암호화 (common/location-crypto.ts). 평문 좌표·고도 칸은 없습니다. 고도가 없으면 null */
  latitude_enc: Buffer;
  longitude_enc: Buffer;
  altitude_enc: Buffer | null;
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
  /** 관제센터 직원이 본 경우 (본 DB config.admin_users.id) */
  viewer_admin_id: string | null;
  /** 취득경로: 대상이 위치를 보낸 앱 (android / ios). 기기가 없으면 null */
  source: string | null;
  purpose: string;
  accessed_at: Generated<Date>;
}

/** 이상징후 판정에 쓰는 사용자별 마지막 상태 (docs/anomaly-alerts.md) */
export interface UserStatusTable {
  user_id: string;
  last_measured_at: Date;
  /** 마지막 위치 위도·경도 (칸마다 암호화) */
  last_latitude_enc: Buffer;
  last_longitude_enc: Buffer;
  last_battery: number | null;
  last_charging: boolean | null;
  /** 지금 자리에 머물기 시작한 기준점 위도·경도 (칸마다 암호화)와 시각 (반경 밖으로 나가면 새로 잡음) */
  anchor_latitude_enc: Buffer;
  anchor_longitude_enc: Buffer;
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
