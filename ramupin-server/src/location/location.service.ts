import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { sql, type Kysely } from 'kysely';

import { ANOMALY_RULES, distanceM } from '../anomaly/anomaly.rules.js';
import { REDIS } from '../redis/redis.module.js';
import type { LocationDatabase } from './location.schema.js';

export const LOCATION_DB = Symbol('LOCATION_DB');
export type LocationDb = Kysely<LocationDatabase>;

export interface LocationPointInput {
  latitude: number;
  longitude: number;
  measuredAt: string;
  altitude?: number | null;
  accuracy?: number | null;
  altitudeAccuracy?: number | null;
  /** m/s */
  speed?: number | null;
  heading?: number | null;
  provider?: string | null;
  satellites?: number | null;
  signalStrength?: number | null;
  battery?: number | null;
  /** 충전 중이었는지. 배터리 100% 가 '충전 중'인지 '방금 꽉 찬 채 끊김'인지 구분합니다 */
  charging?: boolean | null;
  /** 걷기·자전거·차량·정지 (WBS 2.3) */
  activity?: string | null;
  state?: string | null;
}

/** 이상징후 판정에 필요한 마지막 상태 (위치 DB 밖으로 나가는 유일한 모양) */
export interface UserStatusSnapshot {
  userId: string;
  lastMeasuredAt: Date;
  lastBattery: number | null;
  lastCharging: boolean | null;
  fixedSince: Date;
  batteryZeroSince: Date | null;
  lastLatitude: number;
  lastLongitude: number;
}

export interface CurrentLocation {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  battery: number | null;
  measuredAt: string;
}

const currentKey = (userId: string) => `loc:current:${userId}`;

/**
 * 위치 데이터의 유일한 출입구.
 * ★ 위치 DB 는 이 서비스만 사용합니다. 다른 모듈은 이 서비스의 함수로만 위치를 다룹니다.
 *   (위치 DB 를 다른 서버로 옮겨도 이 파일 밖은 바뀌지 않게)
 */
@Injectable()
export class LocationService implements OnModuleInit {
  private readonly logger = new Logger(LocationService.name);

  constructor(
    @Inject(LOCATION_DB) private readonly db: LocationDb,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async onModuleInit() {
    // 이번 달·다음 달 파티션 준비. TODO(6단계): worker 배치로 매일 실행 + 6개월 지난 파티션 삭제
    await sql`SELECT location.ensure_month_partition(now()::date), location.ensure_month_partition((now() + interval '1 month')::date)`.execute(this.db);
  }

  /**
   * 앱이 모아서 보낸 위치 저장.
   * TODO(6단계): 바로 DB 에 쓰지 않고 큐(Redis Stream → 나중에 SQS)에 넣고 worker 가 묶어서 저장 (GPS 보고서 4장)
   */
  async savePoints(userId: string, points: LocationPointInput[]) {
    if (points.length === 0) return { saved: 0 };
    const sorted = [...points].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));

    const results = await this.db
      .insertInto('location.location_points')
      .values(
        sorted.map((p) => ({
          user_id: userId,
          measured_at: p.measuredAt,
          latitude: p.latitude,
          longitude: p.longitude,
          geog: sql`ST_SetSRID(ST_MakePoint(${p.longitude}, ${p.latitude}), 4326)::geography`,
          altitude: p.altitude ?? null,
          accuracy: p.accuracy ?? null,
          altitude_accuracy: p.altitudeAccuracy ?? null,
          speed: p.speed ?? null,
          heading: p.heading ?? null,
          provider: p.provider ?? null,
          satellites: p.satellites ?? null,
          signal_strength: p.signalStrength ?? null,
          battery: p.battery ?? null,
          charging: p.charging ?? null,
          activity: p.activity ?? null,
          state: p.state ?? null,
        })),
      )
      // 네트워크 재전송으로 같은 점이 두 번 와도 무시
      .onConflict((oc) => oc.columns(['user_id', 'measured_at']).doNothing())
      .execute();

    const latest = sorted[sorted.length - 1];
    const current: CurrentLocation = {
      latitude: latest.latitude,
      longitude: latest.longitude,
      accuracy: latest.accuracy ?? null,
      speed: latest.speed ?? null,
      battery: latest.battery ?? null,
      measuredAt: latest.measuredAt,
    };
    // 늦게 도착한 옛날 점이 최신 위치를 덮어쓰지 않게 비교
    const prev = await this.redis.get(currentKey(userId));
    if (!prev || (JSON.parse(prev) as CurrentLocation).measuredAt <= current.measuredAt) {
      await this.redis.set(currentKey(userId), JSON.stringify(current));
    }
    await this.updateStatus(userId, latest);

    const saved = results.reduce((sum, r) => sum + Number(r.numInsertedOrUpdatedRows ?? 0), 0);
    return { received: sorted.length, saved };
  }

  /**
   * 이상징후 판정용 마지막 상태 갱신 (docs/anomaly-alerts.md).
   *
   * 감시 배치가 5분마다 전체 사용자를 훑어야 해서, 그때마다 location_points 를 뒤질 수는 없습니다.
   * 위치가 들어올 때 이 한 줄만 갱신해 두고 배치는 이 표만 읽습니다.
   */
  private async updateStatus(userId: string, latest: LocationPointInput) {
    const measuredAt = new Date(latest.measuredAt);
    const battery = latest.battery ?? null;
    const prev = await this.db
      .selectFrom('location.user_status')
      .selectAll()
      .where('user_id', '=', userId)
      .executeTakeFirst();

    // 늦게 도착한 옛날 점이 최신 상태를 덮어쓰지 않게
    if (prev && prev.last_measured_at >= measuredAt) return;

    // 기준점에서 반경 밖으로 나갔으면 "지금부터 여기 머무는 중"으로 새로 잡습니다
    const movedAway =
      !prev || distanceM(prev.fixed_anchor_latitude, prev.fixed_anchor_longitude, latest.latitude, latest.longitude) > ANOMALY_RULES.fixedRadiusM;

    const batteryZeroSince = battery === 0 ? (prev?.battery_zero_since ?? measuredAt) : null;

    await this.db
      .insertInto('location.user_status')
      .values({
        user_id: userId,
        last_measured_at: measuredAt,
        last_latitude: latest.latitude,
        last_longitude: latest.longitude,
        last_battery: battery,
        last_charging: latest.charging ?? null,
        fixed_anchor_latitude: movedAway ? latest.latitude : prev.fixed_anchor_latitude,
        fixed_anchor_longitude: movedAway ? latest.longitude : prev.fixed_anchor_longitude,
        fixed_since: movedAway ? measuredAt : prev.fixed_since,
        battery_zero_since: batteryZeroSince,
        updated_at: new Date(),
      })
      .onConflict((oc) =>
        oc.column('user_id').doUpdateSet((eb) => ({
          last_measured_at: eb.ref('excluded.last_measured_at'),
          last_latitude: eb.ref('excluded.last_latitude'),
          last_longitude: eb.ref('excluded.last_longitude'),
          last_battery: eb.ref('excluded.last_battery'),
          last_charging: eb.ref('excluded.last_charging'),
          fixed_anchor_latitude: eb.ref('excluded.fixed_anchor_latitude'),
          fixed_anchor_longitude: eb.ref('excluded.fixed_anchor_longitude'),
          fixed_since: eb.ref('excluded.fixed_since'),
          battery_zero_since: eb.ref('excluded.battery_zero_since'),
          updated_at: eb.ref('excluded.updated_at'),
        })),
      )
      .execute();
  }

  /** 여러 사용자의 현재 위치 (Redis) */
  async getCurrent(userIds: string[]): Promise<Map<string, CurrentLocation>> {
    const result = new Map<string, CurrentLocation>();
    if (userIds.length === 0) return result;
    const values = await this.redis.mget(userIds.map(currentKey));
    values.forEach((value, i) => {
      if (value) result.set(userIds[i], JSON.parse(value) as CurrentLocation);
    });
    return result;
  }

  /**
   * 이상징후 감시 배치가 읽는 사용자별 마지막 상태 (docs/anomaly-alerts.md).
   * 위치 DB 연결은 이 모듈 밖으로 나가지 않으므로, 배치는 이 메서드로만 읽습니다.
   */
  async listStatuses(): Promise<UserStatusSnapshot[]> {
    const rows = await this.db.selectFrom('location.user_status').selectAll().execute();
    return rows.map((r) => ({
      userId: r.user_id,
      lastMeasuredAt: r.last_measured_at,
      lastBattery: r.last_battery,
      lastCharging: r.last_charging,
      fixedSince: r.fixed_since,
      batteryZeroSince: r.battery_zero_since,
      lastLatitude: r.last_latitude,
      lastLongitude: r.last_longitude,
    }));
  }

  /** 위치정보 이용·제공 사실 확인자료 (위치정보법) */
  async logAccess(subjectUserIds: string[], viewerUserId: string, purpose: string) {
    if (subjectUserIds.length === 0) return;
    await this.db
      .insertInto('location.location_access_logs')
      .values(subjectUserIds.map((id) => ({ subject_user_id: id, viewer_user_id: viewerUserId, purpose })))
      .execute();
  }

  async ping() {
    await sql`SELECT 1`.execute(this.db);
  }

  async close() {
    await this.db.destroy().catch((e: unknown) => this.logger.warn(String(e)));
  }
}
