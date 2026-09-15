import type { ColumnType, Generated } from 'kysely';

/** 위치 DB (ramupin_location) 테이블 타입. migrations/location 과 맞춰 수정하세요. */
export interface LocationPointsTable {
  user_id: string;
  measured_at: ColumnType<Date, Date | string, never>;
  received_at: Generated<Date>;
  latitude: number;
  longitude: number;
  // PostGIS geography: 넣을 때는 sql`ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography`
  geog: ColumnType<string, unknown, unknown>;
  altitude: number | null;
  accuracy: number | null;
  altitude_accuracy: number | null;
  speed: number | null;
  heading: number | null;
  provider: string | null;
  satellites: number | null;
  signal_strength: number | null;
  battery: number | null;
  state: string | null;
}

export interface LocationAccessLogsTable {
  id: Generated<string>;
  subject_user_id: string;
  viewer_user_id: string | null;
  purpose: string;
  accessed_at: Generated<Date>;
}

export interface LocationDatabase {
  'location.location_points': LocationPointsTable;
  'location.location_access_logs': LocationAccessLogsTable;
}
