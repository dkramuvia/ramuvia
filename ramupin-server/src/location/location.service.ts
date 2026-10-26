import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { sql, type Kysely } from 'kysely';

import { ANOMALY_RULES, distanceM } from '../anomaly/anomaly.rules.js';
import { ChatGateway } from '../chat/chat.gateway.js';
import { encryptOptional, encryptValue, readCoords } from '../common/location-crypto.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { REDIS } from '../redis/redis.module.js';
import type { LocationDatabase } from './location.schema.js';

export const LOCATION_DB = Symbol('LOCATION_DB');
export type LocationDb = Kysely<LocationDatabase>;

/**
 * 위치를 어떤 서비스로 쓰거나 넘겼는지 (확인자료의 "제공서비스").
 * 화면 이름은 관리자 화면의 ACCESS_PURPOSE_NAMES 에 있습니다
 */
export type AccessPurpose = 'friend_list' | 'journey' | 'nearby' | 'sos' | 'geofence' | 'monitoring';

/** 친구가 직접 위치를 본 것 (피드의 "최근에 내 위치를 본 사람") */
const VIEW_PURPOSES: AccessPurpose[] = ['friend_list', 'journey', 'nearby'];

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
    // 확인자료의 취득경로(기기 종류)를 읽으려고만 씁니다 (member.devices)
    @Inject(MAIN_DB) private readonly mainDb: MainDb,
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
          // 위도·경도·고도는 칸마다 암호화해서만 저장합니다 (위치정보법 기술적 보호조치, common/location-crypto.ts)
          latitude_enc: encryptValue(p.latitude),
          longitude_enc: encryptValue(p.longitude),
          altitude_enc: encryptOptional(p.altitude),
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
    // 시각으로 비교합니다. 예전에 저장된 값에는 +09:00 모양이 남아 있을 수 있어 글자로 비교하면 틀립니다
    const prev = await this.redis.get(currentKey(userId));
    if (!prev || Date.parse((JSON.parse(prev) as CurrentLocation).measuredAt) <= Date.parse(current.measuredAt)) {
      await this.redis.set(currentKey(userId), JSON.stringify(current));
    }

    // 지금 이 사람 지도를 보고 있는 친구에게만 즉시 전달.
    // 아무도 안 보면 Redis 갱신까지만 하고 끝냅니다 — 쓸데없는 네트워크를 만들지 않습니다
    if (await this.gateway.hasWatchers(userId)) await this.gateway.emitLocation(userId);
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
    const anchor = prev ? readCoords(prev.anchor_latitude_enc, prev.anchor_longitude_enc) : null;
    const movedAway = !prev || !anchor || distanceM(anchor.latitude, anchor.longitude, latest.latitude, latest.longitude) > ANOMALY_RULES.fixedRadiusM;
    const newAnchor = movedAway || !anchor ? latest : anchor;

    const batteryZeroSince = battery === 0 ? (prev?.battery_zero_since ?? measuredAt) : null;

    await this.db
      .insertInto('location.user_status')
      .values({
        user_id: userId,
        last_measured_at: measuredAt,
        // 위도·경도는 칸마다 암호화해서만 저장합니다 (common/location-crypto.ts)
        last_latitude_enc: encryptValue(latest.latitude),
        last_longitude_enc: encryptValue(latest.longitude),
        anchor_latitude_enc: encryptValue(newAnchor.latitude),
        anchor_longitude_enc: encryptValue(newAnchor.longitude),
        last_battery: battery,
        last_charging: latest.charging ?? null,
        fixed_since: movedAway ? measuredAt : prev.fixed_since,
        battery_zero_since: batteryZeroSince,
        updated_at: new Date(),
      })
      .onConflict((oc) =>
        oc.column('user_id').doUpdateSet((eb) => ({
          last_measured_at: eb.ref('excluded.last_measured_at'),
          last_latitude_enc: eb.ref('excluded.last_latitude_enc'),
          last_longitude_enc: eb.ref('excluded.last_longitude_enc'),
          anchor_latitude_enc: eb.ref('excluded.anchor_latitude_enc'),
          anchor_longitude_enc: eb.ref('excluded.anchor_longitude_enc'),
          last_battery: eb.ref('excluded.last_battery'),
          last_charging: eb.ref('excluded.last_charging'),
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
    const rows = await this.db
      .selectFrom('location.location_points')
      .select(['latitude_enc', 'longitude_enc', 'measured_at'])
      .where('user_id', '=', userId)
      .where('measured_at', '>=', from)
      .where('measured_at', '<', to)
      .orderBy('measured_at')
      .execute();
    return rows.map((r) => ({ ...readCoords(r.latitude_enc, r.longitude_enc), measured_at: r.measured_at }));
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

  /**
   * 최근에 내 위치를 본 사람들 (WBS 9.7 피드).
   *
   * 위치정보법상 남기게 되어 있는 기록을 본인에게 보여 주는 것입니다 —
   * 내 위치를 누가 봤는지는 본인이 알 수 있어야 합니다.
   * 시스템이 본 것(`viewer_user_id` 가 없는 것)은 뺍니다.
   */
  /**
   * 친구별로 내 위치를 얼마나 봤는지 (보완 4.12 위치 공유 중 알림, 스토킹 방지).
   *
   * 친구 목록은 30초마다 다시 받아 그때마다 기록이 남으므로, 기록 건수 그대로가 아니라
   * **10분 단위로 묶어 한 번** 으로 셉니다. "하루 42회 확인" = 지난 24시간에 본 10분 칸 수.
   * 이상 징후: 지난 24시간 횟수가 그 전 3일 하루 평균의 3배 이상이고 5회 이상.
   */
  async viewStats(subjectUserId: string, viewerIds: string[], now = new Date()) {
    const stats = new Map<string, { lastViewedAt: Date | null; viewsToday: number; dailyAverage: number; unusual: boolean }>();
    if (viewerIds.length === 0) return stats;
    const dayAgo = new Date(now.getTime() - 86_400_000);
    const fourDaysAgo = new Date(now.getTime() - 4 * 86_400_000);
    const rows = await sql<{ viewer: string; last_at: Date | null; today: string; before: string }>`
      SELECT viewer_user_id AS viewer,
             max(accessed_at) AS last_at,
             count(DISTINCT date_trunc('hour', accessed_at) + floor(extract(minute FROM accessed_at) / 10) * interval '10 minutes')
               FILTER (WHERE accessed_at >= ${dayAgo}) AS today,
             count(DISTINCT date_trunc('hour', accessed_at) + floor(extract(minute FROM accessed_at) / 10) * interval '10 minutes')
               FILTER (WHERE accessed_at < ${dayAgo}) AS before
      FROM location.location_access_logs
      WHERE subject_user_id = ${subjectUserId}
        AND viewer_user_id = ANY(${viewerIds}::uuid[])
        AND purpose = ANY(${VIEW_PURPOSES}::text[])
        AND accessed_at >= ${fourDaysAgo}
      GROUP BY viewer_user_id
    `.execute(this.db);
    for (const row of rows.rows) {
      const today = Number(row.today);
      const dailyAverage = Number(row.before) / 3;
      stats.set(row.viewer, {
        lastViewedAt: row.last_at ? new Date(row.last_at) : null,
        viewsToday: today,
        dailyAverage: Math.round(dailyAverage * 10) / 10,
        unusual: today >= 5 && today >= dailyAverage * 3,
      });
    }
    return stats;
  }

  async recentViewers(userId: string, since: Date, limit: number) {
    const rows = await this.db
      .selectFrom('location.location_access_logs')
      .select(['id', 'viewer_user_id', 'accessed_at'])
      .where('subject_user_id', '=', userId)
      .where('viewer_user_id', 'is not', null)
      .where('viewer_user_id', '!=', userId)
      // 친구가 직접 본 것만. SOS·안심존 알림으로 보낸 것까지 "봤다"고 띄우면 피드가 알림 반복이 됩니다
      .where('purpose', 'in', VIEW_PURPOSES)
      .where('accessed_at', '>=', since)
      .orderBy('accessed_at', 'desc')
      .limit(limit)
      .execute();
    return rows.map((r) => ({ id: r.id, viewerUserId: r.viewer_user_id as string, accessedAt: r.accessed_at }));
  }

  /**
   * 위치정보 이용·제공 사실 확인자료 (위치정보법) — 한 사람이 여러 사람의 위치를 봤을 때.
   * 취득경로(대상이 위치를 보낸 앱)를 함께 남깁니다 (위치정보사업 신고 [첨부 2])
   */
  async logAccess(subjectUserIds: string[], viewerUserId: string, purpose: AccessPurpose) {
    if (subjectUserIds.length === 0) return;
    const sources = await this.sourcesOf(subjectUserIds);
    await this.db
      .insertInto('location.location_access_logs')
      .values(subjectUserIds.map((id) => ({ subject_user_id: id, viewer_user_id: viewerUserId, purpose, source: sources.get(id) ?? null })))
      .execute();
  }

  /** 한 사람의 위치를 여러 사람에게 보냈을 때 (SOS 수신인, 안심존 알림 받는 친구) */
  async logProvided(subjectUserId: string, recipientIds: string[], purpose: AccessPurpose) {
    if (recipientIds.length === 0) return;
    const source = (await this.sourcesOf([subjectUserId])).get(subjectUserId) ?? null;
    await this.db
      .insertInto('location.location_access_logs')
      .values(recipientIds.map((id) => ({ subject_user_id: subjectUserId, viewer_user_id: id, purpose, source })))
      .execute();
  }

  /** 관제센터 직원이 위치를 봤을 때 (모니터링 상세·SOS 목록) */
  async logAdminView(subjectUserIds: string[], adminId: string, purpose: AccessPurpose) {
    if (subjectUserIds.length === 0) return;
    const sources = await this.sourcesOf(subjectUserIds);
    await this.db
      .insertInto('location.location_access_logs')
      .values(subjectUserIds.map((id) => ({ subject_user_id: id, viewer_admin_id: adminId, purpose, source: sources.get(id) ?? null })))
      .execute();
  }

  /**
   * 관리자 화면 "위치정보 이용·제공사실 확인자료".
   * subjectUserId 를 주면 그 사람의 위치가 쓰인 기록만, before 를 주면 그 id 보다 오래된 것부터 (더 보기).
   */
  async listAccessLogs(options: { subjectUserId?: string; before?: string; limit: number }) {
    let query = this.db
      .selectFrom('location.location_access_logs')
      .select(['id', 'subject_user_id', 'viewer_user_id', 'viewer_admin_id', 'source', 'purpose', 'accessed_at'])
      .orderBy('id', 'desc')
      .limit(options.limit);
    if (options.subjectUserId) query = query.where('subject_user_id', '=', options.subjectUserId);
    if (options.before) query = query.where('id', '<', options.before);
    return query.execute();
  }

  /**
   * 위치를 받은 기록 (위치정보사업 신고: "이용자의 위치정보를 전송받을 때마다").
   * 앱이 한 번에 보낸 묶음이 같은 received_at 으로 저장되므로 묶음 단위로 보여 줍니다.
   */
  async listCollections(options: { userId?: string; before?: Date; limit: number }) {
    let query = this.db
      .selectFrom('location.location_points')
      .select((eb) => ['user_id', 'received_at', eb.fn.countAll<string>().as('points')])
      .groupBy(['user_id', 'received_at'])
      .orderBy('received_at', 'desc')
      .limit(options.limit);
    if (options.userId) query = query.where('user_id', '=', options.userId);
    if (options.before) query = query.where('received_at', '<', options.before);
    const rows = await query.execute();
    const sources = await this.sourcesOf([...new Set(rows.map((r) => r.user_id))]);
    return rows.map((r) => ({ userId: r.user_id, receivedAt: r.received_at, points: Number(r.points), source: sources.get(r.user_id) ?? null }));
  }

  /** 사용자마다 마지막으로 쓴 기기의 종류 (android / ios) — 취득경로 */
  private async sourcesOf(userIds: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (userIds.length === 0) return result;
    const rows = await this.mainDb
      .selectFrom('member.devices')
      .select(['user_id', 'platform'])
      .where('user_id', 'in', userIds)
      .orderBy('last_seen_at', 'desc')
      .execute();
    for (const row of rows) if (!result.has(row.user_id)) result.set(row.user_id, row.platform);
    return result;
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
  last_latitude_enc: Buffer;
  last_longitude_enc: Buffer;
}): UserStatusSnapshot {
  const last = readCoords(r.last_latitude_enc, r.last_longitude_enc);
  return {
    userId: r.user_id,
    lastMeasuredAt: r.last_measured_at,
    lastBattery: r.last_battery,
    lastCharging: r.last_charging,
    fixedSince: r.fixed_since,
    batteryZeroSince: r.battery_zero_since,
    lastLatitude: last.latitude,
    lastLongitude: last.longitude,
  };
}
