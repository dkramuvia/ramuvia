import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { sql, type Kysely } from 'kysely';

import { ANOMALY_RULES, distanceM } from '../anomaly/anomaly.rules.js';
import { ChatGateway } from '../chat/chat.gateway.js';
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
/** 경계·시계 오차에 대비해 이만큼 일찍 가져옵니다 */
const FETCH_MARGIN_MS = 60_000;

/** 감시가 훑을 대상을 정하는 기준. anomaly.rules.ts 의 가장 이른 단계 값을 씁니다 */
export interface StatusThresholds {
  /** 신호 두절 1단계 (분) */
  noSignalMinutes: number;
  /** 위치 고정 1단계 (분) */
  fixedMinutes: number;
  /** 배터리 부족 기준 (%) */
  lowBatteryPercent: number;
}

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
export class LocationService {
  private readonly logger = new Logger(LocationService.name);

  constructor(
    @Inject(LOCATION_DB) private readonly db: LocationDb,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly gateway: ChatGateway,
  ) {}

  /**
   * 앱이 모아서 보낸 위치 저장.
   * 이 메서드는 **워커가 부릅니다.** 앱 요청은 큐에 넣고 바로 응답합니다 (location.queue.ts).
   */
  async savePoints(userId: string, points: LocationPointInput[]) {
    if (points.length === 0) return { received: 0, saved: 0 };
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

    await this.updateStatus(userId, sorted[sorted.length - 1]);

    const saved = results.reduce((sum, r) => sum + Number(r.numInsertedOrUpdatedRows ?? 0), 0);
    return { received: sorted.length, saved };
  }

  /**
   * 받자마자 해야 하는 것 (GPS 보고서 4-2, 4-3).
   *
   * 현재 위치는 Redis 에 바로 덮어쓰고, 보고 있는 친구에게 바로 전달합니다.
   * 이건 메모리 작업이라 빠르고, 늦추면 "실시간 위치"가 아니게 됩니다.
   * 반대로 이력 저장(location_points)은 몇 초 늦어도 아무도 모르므로 큐로 넘깁니다.
   */
  async updateCurrent(userId: string, points: LocationPointInput[]): Promise<void> {
    if (points.length === 0) return;
    const latest = [...points].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))[points.length - 1];
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

    // 지금 이 사람 지도를 보고 있는 친구에게만 즉시 전달.
    // 아무도 안 보면 Redis 갱신까지만 하고 끝냅니다 — 쓸데없는 네트워크를 만들지 않습니다
    if (await this.gateway.hasWatchers(userId)) await this.gateway.emitLocation(userId, current);
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
   * 하루치 위치 (이동 기록 화면, WBS 4.5).
   *
   * 하루 최대 1,800건이라 그대로 읽어도 되지만, 화면에 필요한 것은 좌표와 시각뿐이라
   * 그 세 칸만 가져옵니다. 배터리·위성 같은 것까지 끌어오면 전송량이 몇 배가 됩니다.
   */
  async dayPoints(userId: string, from: Date, to: Date) {
    return this.db
      .selectFrom('location.location_points')
      .select(['latitude', 'longitude', 'measured_at'])
      .where('user_id', '=', userId)
      .where('measured_at', '>=', from)
      .where('measured_at', '<', to)
      .orderBy('measured_at')
      .execute();
  }

  /**
   * "언제부터 한자리에 있는지" (지도 마커의 "같은 자리에서 1시간 40분", 2026-09-28 디자인).
   *
   * 이상징후 판정에 쓰려고 이미 갱신하고 있던 값(`fixed_since`)을 그대로 씁니다.
   * 50m 밖으로 나가면 서버가 그 시각을 새로 잡으므로(updateStatus), 따로 계산할 것이 없습니다.
   */
  async getStayedSince(userIds: string[]): Promise<Map<string, Date>> {
    const result = new Map<string, Date>();
    if (userIds.length === 0) return result;
    const rows = await this.db
      .selectFrom('location.user_status')
      .select(['user_id', 'fixed_since'])
      .where('user_id', 'in', userIds)
      .execute();
    for (const row of rows) result.set(row.user_id, row.fixed_since);
    return result;
  }

  /** 한 사람의 마지막 상태 (모니터링 상세 화면) */
  async getStatus(userId: string): Promise<UserStatusSnapshot | null> {
    const row = await this.db.selectFrom('location.user_status').selectAll().where('user_id', '=', userId).executeTakeFirst();
    return row ? toSnapshot(row) : null;
  }

  /**
   * 이상징후 감시가 봐야 할 사람만 골라 옵니다 (docs/anomaly-alerts.md).
   *
   * 전에는 user_status 를 통째로 읽었습니다. 10만 대면 버티지만 100만 대면
   * 5분마다 100만 행이라 감당이 안 됩니다 (하루 2.9억 행).
   *
   * 실제로 봐야 하는 사람은 아래 넷 중 하나에 해당하는 소수뿐이라, 인덱스로 걸러냅니다.
   * 조건은 anomaly.rules.ts 의 detect() 가 보는 것과 같습니다 — 한쪽만 바꾸면 안 됩니다.
   *
   * @param extraUserIds 지금 이상징후가 열려 있는 사람. 조건에서 벗어났어도 가져와야
   *                     "다시 움직였으니 해제" 를 판단할 수 있습니다
   */
  async listStatusesToCheck(thresholds: StatusThresholds, extraUserIds: string[] = []): Promise<UserStatusSnapshot[]> {
    // 경계에서 놓치지 않게 조금 일찍 가져옵니다.
    // 판정은 "30분 이상"인데 조회가 "30분 초과"면 정확히 30분인 사람이 빠집니다.
    // 서버와 폰의 시계가 조금 어긋나는 경우도 이 여유가 흡수합니다 (2026-09-22)
    const now = Date.now() + FETCH_MARGIN_MS;
    const rows = await this.db
      .selectFrom('location.user_status')
      .selectAll()
      .where((eb) =>
        eb.or([
          // 신호가 끊긴 지 오래됨
          eb('last_measured_at', '<', new Date(now - thresholds.noSignalMinutes * 60_000)),
          // 한자리에 오래 머묾
          eb('fixed_since', '<', new Date(now - thresholds.fixedMinutes * 60_000)),
          // 배터리 0% 가 이어짐
          eb('battery_zero_since', 'is not', null),
          // 배터리가 얼마 안 남음
          eb('last_battery', '<=', thresholds.lowBatteryPercent),
          // 열려 있는 건은 해제 판단을 위해 항상 포함
          ...(extraUserIds.length > 0 ? [eb('user_id', 'in', extraUserIds)] : []),
        ]),
      )
      .execute();
    return rows.map(toSnapshot);
  }

  /**
   * 탈퇴한 사용자의 위치를 지웁니다 (WBS 11.2).
   *
   * 위치 DB 는 본 DB 와 다른 데이터베이스라, 사용자 행을 지워도 따라 지워지지 않습니다.
   *
   * `location_access_logs` 는 **지우지 않습니다.** 위치정보 이용·제공 사실 확인자료는
   * 위치정보법상 보관 의무가 있는 자료입니다 (retention.service.ts 설명 참고).
   */
  async deleteUserData(userId: string): Promise<{ points: number }> {
    const points = await this.db.deleteFrom('location.location_points').where('user_id', '=', userId).executeTakeFirst();
    await this.db.deleteFrom('location.user_status').where('user_id', '=', userId).execute();
    await this.redis.del(currentKey(userId));
    const deleted = Number(points.numDeletedRows ?? 0);
    this.logger.log(`탈퇴 사용자 위치 삭제: ${deleted}건`);
    return { points: deleted };
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

/** user_status 한 행 → 감시·화면이 쓰는 모양 */
function toSnapshot(r: {
  user_id: string;
  last_measured_at: Date;
  last_battery: number | null;
  last_charging: boolean | null;
  fixed_since: Date;
  battery_zero_since: Date | null;
  last_latitude: number;
  last_longitude: number;
}): UserStatusSnapshot {
  return {
    userId: r.user_id,
    lastMeasuredAt: r.last_measured_at,
    lastBattery: r.last_battery,
    lastCharging: r.last_charging,
    fixedSince: r.fixed_since,
    batteryZeroSince: r.battery_zero_since,
    lastLatitude: r.last_latitude,
    lastLongitude: r.last_longitude,
  };
}
