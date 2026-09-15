import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { sql, type Kysely } from 'kysely';

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
  state?: string | null;
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
    const saved = results.reduce((sum, r) => sum + Number(r.numInsertedOrUpdatedRows ?? 0), 0);
    return { received: sorted.length, saved };
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
