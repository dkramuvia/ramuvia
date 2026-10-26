import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { ChatGateway } from '../chat/chat.gateway.js';
import { encryptValue, readCoords } from '../common/location-crypto.js';
import { policyNumber, resolvePolicy, type Policy } from '../config/policy.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { inQuietHours } from '../push/notification-settings.service.js';
import { PushService } from '../push/push.service.js';
import { distanceM } from './geo.js';
import { judgeCrossing, settleCrossing, type Crossing, type PendingState } from './zone-crossing.js';

/**
 * 장소(즐겨찾기)·안심장소(지오펜스)와 진입·이탈 알림 (WBS 8.8, 9.4).
 *
 * 장소와 안심장소는 같은 표입니다 (10-26 대표님: 한도 통합). 드나들 때 알림을 켠(enabled) 장소가 안심장소이고,
 * 끈 장소는 즐겨찾기로만 남습니다. 판정은 켜진 장소만 합니다.
 *
 * **판정을 서버가 하는 이유**: 알림을 받는 사람이 본인이 아니라 친구입니다.
 * 폰이 혼자 알아차려도 결국 서버를 거쳐야 하고, 폰이 꺼져 있으면 아예 못 보냅니다.
 * 위치는 어차피 서버로 올라오므로 그때 판정하면 앱 상태와 무관하게 동작합니다.
 *
 * **늦어지는 만큼**: 위치는 1분에 한 번 모아서 올라옵니다. 그래서 알림도 최대 1분 늦습니다.
 * 대신 안심장소 근처에 오면 폰이 5초 주기로 바꾸므로(GPS 보고서 2-1 2번) 넘은 **시각**은 정확합니다.
 *
 * **알림 두 방향 (보완 4.17)**
 *   - 내가 내 장소를 드나들 때 → 지정한 친구에게 (notify_friends, 내가 그 친구에게 "정확" 으로 공유 중일 때만)
 *   - 지정한 친구가 내 장소를 드나들 때 → 나에게 (watch_enter/leave, 그 친구가 나에게 "정확" 으로 공유 중일 때만)
 *   경계에서 오가는 것을 막으려고 3분 넘게 그 쪽에 있어야 확정합니다 (zone-crossing.ts settleCrossing).
 *   알림 시간을 정해 두면 그 시간에만 알립니다 (기록은 남깁니다).
 */

export type ZoneKind = 'home' | 'work' | 'school' | 'hospital' | 'other';

/** 장소에 지정한 친구 한 명. enter/leave = 이 친구의 도착·출발을 나에게 알릴지 */
export interface ZoneRecipientInput {
  friendId: string;
  enter: boolean;
  leave: boolean;
}

export interface ZoneInput {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  radiusM: number;
  enabled: boolean;
  kind: ZoneKind;
  /** 내가 드나들 때 지정한 친구에게 알릴지 */
  notifyFriends: boolean;
  /** 알림 시간 'HH:MM'. 둘 다 null 이면 항상 */
  alertStart: string | null;
  alertEnd: string | null;
  recipients: ZoneRecipientInput[];
}

export interface Fix {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  measuredAt: Date;
}

/** 드나든 것 하나와, 그 소식(=위치)을 받은 친구 */
export interface ZoneCrossing {
  crossing: Crossing;
  notified: string[];
}

@Injectable()
export class SafeZoneService {
  private readonly logger = new Logger(SafeZoneService.name);

  constructor(
    @Inject(MAIN_DB) private readonly db: MainDb,
    private readonly gateway: ChatGateway,
    private readonly push: PushService,
  ) {}

  /** 내 안심장소 목록 (앱 설정 화면 + 폰의 "근처인가" 판단용) */
  async list(userId: string) {
    const zones = await this.db
      .selectFrom('member.safe_zones')
      .select([
        'id',
        'name',
        'address',
        'latitude',
        'longitude',
        'radius_m',
        'enabled',
        'inside',
        'inside_since',
        'kind',
        'notify_friends',
        'alert_start',
        'alert_end',
      ])
      .where('user_id', '=', userId)
      .orderBy('created_at')
      .execute();
    if (zones.length === 0) return [];

    const recipients = await this.db
      .selectFrom('member.safe_zone_recipients')
      .select(['zone_id', 'friend_id', 'watch_enter', 'watch_leave'])
      .where(
        'zone_id',
        'in',
        zones.map((z) => z.id),
      )
      .execute();

    return zones.map((z) => ({
      id: z.id,
      name: z.name,
      address: z.address,
      center: { latitude: z.latitude, longitude: z.longitude },
      radiusM: z.radius_m,
      enabled: z.enabled,
      inside: z.inside,
      insideSince: z.inside_since?.toISOString() ?? null,
      kind: z.kind,
      notifyFriends: z.notify_friends,
      alertStart: z.alert_start?.slice(0, 5) ?? null,
      alertEnd: z.alert_end?.slice(0, 5) ?? null,
      recipients: recipients
        .filter((r) => r.zone_id === z.id)
        .map((r) => ({ friendId: r.friend_id, enter: r.watch_enter, leave: r.watch_leave })),
      // 예전 앱이 읽는 모양
      recipientFriendIds: recipients.filter((r) => r.zone_id === z.id).map((r) => r.friend_id),
    }));
  }

  async create(userId: string, input: ZoneInput) {
    const policy = await resolvePolicy(this.db, userId);
    const limit = policyNumber(policy, 'placeLimit', 0);
    const count = await this.db
      .selectFrom('member.safe_zones')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('user_id', '=', userId)
      .executeTakeFirstOrThrow();
    if (Number(count.n) >= limit) {
      throw new BadRequestException(`장소는 ${limit}개까지 등록할 수 있습니다 (지금 등급 기준)`);
    }
    // 만들기 전에 먼저 막습니다. 넣고 나서 거절하면 이름만 있는 장소가 남습니다
    if (input.enabled) await this.assertCanAlert(userId, policy, null);

    const row = await this.db
      .insertInto('member.safe_zones')
      .values({
        user_id: userId,
        name: input.name,
        address: input.address,
        latitude: input.latitude,
        longitude: input.longitude,
        radius_m: input.radiusM,
        enabled: input.enabled,
        ...zoneOptions(input),
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    await this.replaceRecipients(userId, row.id, input.recipients);
    return this.one(userId, row.id);
  }

  async update(userId: string, zoneId: string, input: ZoneInput) {
    const policy = await resolvePolicy(this.db, userId);
    if (input.enabled) await this.assertCanAlert(userId, policy, zoneId);
    const updated = await this.db
      .updateTable('member.safe_zones')
      .set({
        name: input.name,
        address: input.address,
        latitude: input.latitude,
        longitude: input.longitude,
        radius_m: input.radiusM,
        enabled: input.enabled,
        ...zoneOptions(input),
        updated_at: new Date(),
      })
      .where('id', '=', zoneId)
      .where('user_id', '=', userId)
      .returning('id')
      .executeTakeFirst();
    if (!updated) throw new NotFoundException('장소를 찾을 수 없습니다');

    await this.replaceRecipients(userId, zoneId, input.recipients);
    return this.one(userId, zoneId);
  }

  async remove(userId: string, zoneId: string) {
    const deleted = await this.db
      .deleteFrom('member.safe_zones')
      .where('id', '=', zoneId)
      .where('user_id', '=', userId)
      .returning('id')
      .executeTakeFirst();
    if (!deleted) throw new NotFoundException('장소를 찾을 수 없습니다');
    return { ok: true };
  }

  /** 내가 드나든 기록 (알림 보관함 · 이동 기록에서 씁니다) */
  async events(userId: string, limit = 50) {
    const rows = await this.db
      .selectFrom('member.safe_zone_events as e')
      .innerJoin('member.safe_zones as z', 'z.id', 'e.zone_id')
      .select(['e.id', 'e.kind', 'e.occurred_at', 'e.latitude_enc', 'e.longitude_enc', 'z.id as zoneId', 'z.name'])
      .where('e.user_id', '=', userId)
      // 친구 장소를 드나든 기록도 같은 표에 있지만, 내 기록에는 남의 장소 이름을 보이지 않습니다
      .where('z.user_id', '=', userId)
      .orderBy('e.occurred_at', 'desc')
      .limit(Math.min(limit, 200))
      .execute();
    return rows.map((r) => ({
      id: r.id,
      zoneId: r.zoneId,
      zoneName: r.name,
      kind: r.kind,
      occurredAt: r.occurred_at.toISOString(),
      // 드나든 위치는 암호화돼 있어 여기서 풉니다 (common/location-crypto.ts)
      ...readCoords(r.latitude_enc, r.longitude_enc),
    }));
  }

  /**
   * 위치가 들어올 때 부릅니다. 드나든 것이 있으면 기록하고 친구에게 알립니다.
   *
   * 위치 저장 워커에서 부르므로 **절대 예외를 밖으로 던지지 않습니다.**
   * 지오펜스 판정이 실패했다고 위치 저장이 통째로 실패하면 안 됩니다.
   */
  async check(userId: string, fix: Fix): Promise<ZoneCrossing[]> {
    try {
      return await this.checkInner(userId, fix);
    } catch (error) {
      this.logger.error(`안심장소 판정 실패 (user ${userId}): ${String(error)}`);
      return [];
    }
  }

  private async checkInner(userId: string, fix: Fix): Promise<ZoneCrossing[]> {
    const me = await this.db
      .selectFrom('member.users')
      .select(['nickname', 'hide_all', 'hide_until'])
      .where('id', '=', userId)
      .executeTakeFirst();
    if (!me) return [];
    // 숨기기 모드면 내 드나듦을 아무에게도 알리지 않습니다 (기록은 남깁니다)
    const hiding = me.hide_all && (!me.hide_until || me.hide_until.getTime() > Date.now());

    const own = await this.checkOwnZones(userId, me.nickname, hiding, fix);
    const watched = hiding ? [] : await this.checkWatchedZones(userId, me.nickname, fix);
    return [...own, ...watched];
  }

  /** 내 장소: 내가 드나들면 지정한 친구에게 */
  private async checkOwnZones(userId: string, nickname: string, hiding: boolean, fix: Fix): Promise<ZoneCrossing[]> {
    const zones = await this.db
      .selectFrom('member.safe_zones')
      .select(['id', 'name', 'latitude', 'longitude', 'radius_m', 'inside', 'pending_kind', 'pending_since', 'notify_friends', 'alert_start', 'alert_end'])
      .where('user_id', '=', userId)
      .where('enabled', '=', true)
      .execute();

    const results: ZoneCrossing[] = [];
    for (const zone of zones) {
      const state: PendingState = { inside: zone.inside, pendingKind: zone.pending_kind, pendingSince: zone.pending_since };
      const candidate = judgeCrossing({ latitude: zone.latitude, longitude: zone.longitude, radiusM: zone.radius_m, inside: zone.inside }, fix);
      const step = settleCrossing(state, candidate, fix.measuredAt);
      if (step.action === 'none') continue;

      // 여러 서버가 같은 사람의 위치를 나눠 처리할 수 있습니다. 읽은 상태 그대로일 때만 바꿉니다
      const guard = this.db
        .updateTable('member.safe_zones')
        .where('id', '=', zone.id)
        .where('inside', '=', zone.inside)
        .where((eb) => (zone.pending_kind ? eb('pending_kind', '=', zone.pending_kind) : eb('pending_kind', 'is', null)));
      if (step.action !== 'confirm') {
        await guard
          .set(step.action === 'pend' ? { pending_kind: candidate, pending_since: fix.measuredAt } : { pending_kind: null, pending_since: null })
          .execute();
        continue;
      }
      const changed = await guard
        .set({
          inside: step.kind === 'enter',
          inside_since: step.kind === 'enter' ? step.occurredAt : null,
          pending_kind: null,
          pending_since: null,
          updated_at: new Date(),
        })
        .returning('id')
        .executeTakeFirst();
      if (!changed) continue;

      await this.recordEvent(zone.id, userId, step.kind, step.occurredAt, fix);
      const notified =
        !hiding && zone.notify_friends && (await this.inAlertWindow(userId, zone.alert_start, zone.alert_end))
          ? await this.notifyFriends(userId, nickname, zone.id, zone.name, step.kind, step.occurredAt)
          : [];
      results.push({ crossing: step.kind, notified });
    }
    return results;
  }

  /** 친구 장소: 내가 친구의 장소를 드나들면 그 장소 주인에게 (주인이 나를 지정했고, 내가 주인에게 정확으로 공유 중일 때) */
  private async checkWatchedZones(userId: string, nickname: string, fix: Fix): Promise<ZoneCrossing[]> {
    const rows = await this.db
      .selectFrom('member.safe_zone_recipients as r')
      .innerJoin('member.safe_zones as z', 'z.id', 'r.zone_id')
      .innerJoin('social.friend_share_settings as s', (join) => join.onRef('s.owner_id', '=', 'r.friend_id').onRef('s.friend_id', '=', 'z.user_id'))
      .select([
        'z.id as zoneId',
        'z.user_id as ownerId',
        'z.name',
        'z.latitude',
        'z.longitude',
        'z.radius_m',
        'z.alert_start',
        'z.alert_end',
        'r.watch_enter',
        'r.watch_leave',
        'r.inside',
        'r.pending_kind',
        'r.pending_since',
      ])
      .where('r.friend_id', '=', userId)
      .where('z.enabled', '=', true)
      .where('s.location_level', '=', 'exact')
      .where((eb) => eb.or([eb('r.watch_enter', '=', true), eb('r.watch_leave', '=', true)]))
      .execute();

    const results: ZoneCrossing[] = [];
    for (const row of rows) {
      const where = this.db.updateTable('member.safe_zone_recipients').where('zone_id', '=', row.zoneId).where('friend_id', '=', userId);

      // 처음 보는 친구: 지금 안인지 밖인지만 조용히 적어 둡니다 (이미 안에 있던 친구가 "도착" 으로 울리지 않게)
      if (row.inside === null) {
        if (fix.accuracy != null && fix.accuracy > 100) continue;
        const inside = distanceM({ latitude: row.latitude, longitude: row.longitude }, fix) <= row.radius_m;
        await where.where('inside', 'is', null).set({ inside, inside_since: inside ? fix.measuredAt : null }).execute();
        continue;
      }

      const state: PendingState = { inside: row.inside, pendingKind: row.pending_kind, pendingSince: row.pending_since };
      const candidate = judgeCrossing({ latitude: row.latitude, longitude: row.longitude, radiusM: row.radius_m, inside: row.inside }, fix);
      const step = settleCrossing(state, candidate, fix.measuredAt);
      if (step.action === 'none') continue;

      const guard = where
        .where('inside', '=', row.inside)
        .where((eb) => (row.pending_kind ? eb('pending_kind', '=', row.pending_kind) : eb('pending_kind', 'is', null)));
      if (step.action !== 'confirm') {
        await guard
          .set(step.action === 'pend' ? { pending_kind: candidate, pending_since: fix.measuredAt } : { pending_kind: null, pending_since: null })
          .execute();
        continue;
      }
      const changed = await guard
        .set({ inside: step.kind === 'enter', inside_since: step.kind === 'enter' ? step.occurredAt : null, pending_kind: null, pending_since: null })
        .returning('zone_id')
        .executeTakeFirst();
      if (!changed) continue;

      await this.recordEvent(row.zoneId, userId, step.kind, step.occurredAt, fix);
      const wanted = step.kind === 'enter' ? row.watch_enter : row.watch_leave;
      if (!wanted || !(await this.inAlertWindow(row.ownerId, row.alert_start, row.alert_end))) {
        results.push({ crossing: step.kind, notified: [] });
        continue;
      }
      await this.send([row.ownerId], userId, nickname, row.zoneId, row.name, step.kind, step.occurredAt);
      results.push({ crossing: step.kind, notified: [row.ownerId] });
    }
    return results;
  }

  private async recordEvent(zoneId: string, userId: string, kind: 'enter' | 'leave', occurredAt: Date, fix: Fix) {
    await this.db
      .insertInto('member.safe_zone_events')
      .values({
        zone_id: zoneId,
        user_id: userId,
        kind,
        occurred_at: occurredAt,
        // 드나든 순간의 위도·경도는 칸마다 암호화해서만 저장합니다 (common/location-crypto.ts)
        latitude_enc: encryptValue(fix.latitude),
        longitude_enc: encryptValue(fix.longitude),
      })
      .execute();
  }

  /** 알림 시간 안인가 (장소 주인의 시간대). 정하지 않았으면 항상 */
  private async inAlertWindow(ownerId: string, start: string | null, end: string | null): Promise<boolean> {
    if (!start || !end) return true;
    const settings = await this.db.selectFrom('member.notification_settings').select('timezone').where('user_id', '=', ownerId).executeTakeFirst();
    return inQuietHours(start, end, settings?.timezone ?? 'Asia/Seoul');
  }

  /** 내가 드나든 것을 지정한 친구에게. 내가 "정확" 으로 공유 중인 친구에게만 갑니다 (보완 4.17) */
  private async notifyFriends(userId: string, nickname: string, zoneId: string, zoneName: string, kind: 'enter' | 'leave', at: Date): Promise<string[]> {
    const rows = await this.db
      .selectFrom('member.safe_zone_recipients as r')
      .innerJoin('social.friend_share_settings as s', (join) => join.on('s.owner_id', '=', userId).onRef('s.friend_id', '=', 'r.friend_id'))
      .select('r.friend_id')
      .where('r.zone_id', '=', zoneId)
      .where('s.location_level', '=', 'exact')
      .execute();
    const friendIds = rows.map((r) => r.friend_id);
    if (friendIds.length === 0) return [];
    await this.send(friendIds, userId, nickname, zoneId, zoneName, kind, at);
    return friendIds;
  }

  private async send(to: string[], userId: string, nickname: string, zoneId: string, zoneName: string, kind: 'enter' | 'leave', at: Date) {
    const body = kind === 'enter' ? `${nickname}님이 ${zoneName}에 도착했어요` : `${nickname}님이 ${zoneName}에서 나갔어요`;
    this.gateway.emitGeofence(to, { userId, nickname, zoneId, zoneName, kind, occurredAt: at.toISOString() });
    await this.push
      .sendToUsers(to, {
        title: '라무핀',
        body,
        channel: 'general',
        category: 'geofence',
        route: `/journey/${userId}`,
        data: { zoneId, kind },
      })
      .catch((error: unknown) => this.logger.error(`지오펜스 푸시 실패: ${String(error)}`));
  }

  /**
   * 지정한 친구를 다시 씁니다. 친구가 아닌 사람은 걸러 냅니다.
   * 이미 있던 친구는 "지금 안에 있는지" 를 그대로 두고 도착·출발 선택만 바꿉니다 (지웠다 넣으면 다시 "도착" 이 울림)
   */
  private async replaceRecipients(userId: string, zoneId: string, recipients: ZoneRecipientInput[]) {
    const friends = recipients.length
      ? await this.db
          .selectFrom('social.friendships')
          .select('friend_id')
          .where('user_id', '=', userId)
          .where(
            'friend_id',
            'in',
            recipients.map((r) => r.friendId),
          )
          .execute()
      : [];
    const allowed = recipients.filter((r) => friends.some((f) => f.friend_id === r.friendId));

    let removal = this.db.deleteFrom('member.safe_zone_recipients').where('zone_id', '=', zoneId);
    if (allowed.length) removal = removal.where('friend_id', 'not in', allowed.map((r) => r.friendId));
    await removal.execute();
    if (allowed.length === 0) return;

    await this.db
      .insertInto('member.safe_zone_recipients')
      .values(allowed.map((r) => ({ zone_id: zoneId, friend_id: r.friendId, watch_enter: r.enter, watch_leave: r.leave })))
      .onConflict((oc) =>
        oc.columns(['zone_id', 'friend_id']).doUpdateSet((eb) => ({ watch_enter: eb.ref('excluded.watch_enter'), watch_leave: eb.ref('excluded.watch_leave') })),
      )
      .execute();
  }

  /**
   * 알림을 켤 수 있는지 (10-26 대표님: 장소와 지오펜스 한도 통합).
   * 장소는 placeLimit 까지 저장하고, 그중 드나들 때 알림을 켠 장소(=안심존)는 geofenceAlertLimit 까지입니다.
   * 이미 켜져 있던 장소를 고칠 때는 자기 자신을 세지 않습니다(zoneId).
   */
  private async assertCanAlert(userId: string, policy: Policy, zoneId: string | null) {
    const limit = policyNumber(policy, 'geofenceAlertLimit', 0);
    let query = this.db
      .selectFrom('member.safe_zones')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('user_id', '=', userId)
      .where('enabled', '=', true);
    if (zoneId) query = query.where('id', '!=', zoneId);
    const count = await query.executeTakeFirstOrThrow();
    if (Number(count.n) >= limit) {
      throw new BadRequestException(
        limit === 0
          ? '지금 등급에서는 드나들 때 알림을 쓸 수 없습니다'
          : `드나들 때 알림은 장소 ${limit}곳까지 켤 수 있습니다 (지금 등급 기준)`,
      );
    }
  }

  private async one(userId: string, zoneId: string) {
    const zones = await this.list(userId);
    const found = zones.find((z) => z.id === zoneId);
    if (!found) throw new NotFoundException('장소를 찾을 수 없습니다');
    return found;
  }
}

/** 저장할 장소 옵션 (종류·알림 방향·알림 시간) */
function zoneOptions(input: ZoneInput) {
  const timed = input.alertStart && input.alertEnd;
  return {
    kind: input.kind,
    notify_friends: input.notifyFriends,
    alert_start: timed ? input.alertStart : null,
    alert_end: timed ? input.alertEnd : null,
  };
}
