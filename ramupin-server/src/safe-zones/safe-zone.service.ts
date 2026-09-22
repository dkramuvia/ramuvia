import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { ChatGateway } from '../chat/chat.gateway.js';
import { policyNumber, resolvePolicy, type Policy } from '../config/policy.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { PushService } from '../push/push.service.js';
import { judgeCrossing, type Crossing } from './zone-crossing.js';

/**
 * 안심장소(지오펜스)와 진입·이탈 알림 (WBS 8.8, 9.4).
 *
 * **판정을 서버가 하는 이유**: 알림을 받는 사람이 본인이 아니라 친구입니다.
 * 폰이 혼자 알아차려도 결국 서버를 거쳐야 하고, 폰이 꺼져 있으면 아예 못 보냅니다.
 * 위치는 어차피 서버로 올라오므로 그때 판정하면 앱 상태와 무관하게 동작합니다.
 *
 * **늦어지는 만큼**: 위치는 1분에 한 번 모아서 올라옵니다. 그래서 알림도 최대 1분 늦습니다.
 * 대신 안심장소 근처에 오면 폰이 5초 주기로 바꾸므로(GPS 보고서 2-1 2번) 넘은 **시각**은 정확합니다.
 */

export interface ZoneInput {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  radiusM: number;
  enabled: boolean;
  /** 드나들 때 알림 받을 친구 */
  recipientFriendIds: string[];
}

export interface Fix {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  measuredAt: Date;
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
      .select(['id', 'name', 'address', 'latitude', 'longitude', 'radius_m', 'enabled', 'inside', 'inside_since'])
      .where('user_id', '=', userId)
      .orderBy('created_at')
      .execute();
    if (zones.length === 0) return [];

    const recipients = await this.db
      .selectFrom('member.safe_zone_recipients')
      .select(['zone_id', 'friend_id'])
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
      recipientFriendIds: recipients.filter((r) => r.zone_id === z.id).map((r) => r.friend_id),
    }));
  }

  async create(userId: string, input: ZoneInput) {
    const policy = await resolvePolicy(this.db, userId);
    const limit = policyNumber(policy, 'safeZoneLimit', 0);
    const count = await this.db
      .selectFrom('member.safe_zones')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('user_id', '=', userId)
      .executeTakeFirstOrThrow();
    if (Number(count.n) >= limit) {
      throw new BadRequestException(`안심장소는 ${limit}개까지 등록할 수 있습니다 (지금 등급 기준)`);
    }
    // 만들기 전에 먼저 막습니다. 넣고 나서 거절하면 이름만 있는 안심장소가 남습니다
    this.assertCanAlert(policy, input.recipientFriendIds);

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
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    await this.replaceRecipients(userId, row.id, input.recipientFriendIds, policy);
    return this.one(userId, row.id);
  }

  async update(userId: string, zoneId: string, input: ZoneInput) {
    const policy = await resolvePolicy(this.db, userId);
    this.assertCanAlert(policy, input.recipientFriendIds);
    const updated = await this.db
      .updateTable('member.safe_zones')
      .set({
        name: input.name,
        address: input.address,
        latitude: input.latitude,
        longitude: input.longitude,
        radius_m: input.radiusM,
        enabled: input.enabled,
        updated_at: new Date(),
      })
      .where('id', '=', zoneId)
      .where('user_id', '=', userId)
      .returning('id')
      .executeTakeFirst();
    if (!updated) throw new NotFoundException('안심장소를 찾을 수 없습니다');

    await this.replaceRecipients(userId, zoneId, input.recipientFriendIds, policy);
    return this.one(userId, zoneId);
  }

  async remove(userId: string, zoneId: string) {
    const deleted = await this.db
      .deleteFrom('member.safe_zones')
      .where('id', '=', zoneId)
      .where('user_id', '=', userId)
      .returning('id')
      .executeTakeFirst();
    if (!deleted) throw new NotFoundException('안심장소를 찾을 수 없습니다');
    return { ok: true };
  }

  /** 내가 드나든 기록 (알림 보관함 · 이동 기록에서 씁니다) */
  async events(userId: string, limit = 50) {
    const rows = await this.db
      .selectFrom('member.safe_zone_events as e')
      .innerJoin('member.safe_zones as z', 'z.id', 'e.zone_id')
      .select(['e.id', 'e.kind', 'e.occurred_at', 'e.latitude', 'e.longitude', 'z.id as zoneId', 'z.name'])
      .where('e.user_id', '=', userId)
      .orderBy('e.occurred_at', 'desc')
      .limit(Math.min(limit, 200))
      .execute();
    return rows.map((r) => ({
      id: r.id,
      zoneId: r.zoneId,
      zoneName: r.name,
      kind: r.kind,
      occurredAt: r.occurred_at.toISOString(),
      latitude: r.latitude,
      longitude: r.longitude,
    }));
  }

  /**
   * 위치가 들어올 때 부릅니다. 드나든 것이 있으면 기록하고 친구에게 알립니다.
   *
   * 위치 저장 워커에서 부르므로 **절대 예외를 밖으로 던지지 않습니다.**
   * 지오펜스 판정이 실패했다고 위치 저장이 통째로 실패하면 안 됩니다.
   */
  async check(userId: string, fix: Fix): Promise<Crossing[]> {
    try {
      return await this.checkInner(userId, fix);
    } catch (error) {
      this.logger.error(`안심장소 판정 실패 (user ${userId}): ${String(error)}`);
      return [];
    }
  }

  private async checkInner(userId: string, fix: Fix): Promise<Crossing[]> {
    const zones = await this.db
      .selectFrom('member.safe_zones')
      .select(['id', 'name', 'latitude', 'longitude', 'radius_m', 'inside'])
      .where('user_id', '=', userId)
      .where('enabled', '=', true)
      .execute();
    if (zones.length === 0) return [];

    const results: Crossing[] = [];
    for (const zone of zones) {
      const crossing = judgeCrossing(
        { latitude: zone.latitude, longitude: zone.longitude, radiusM: zone.radius_m, inside: zone.inside },
        fix,
      );
      if (!crossing) continue;

      // 여러 서버가 같은 사람의 위치를 나눠 처리할 수 있습니다.
      // 직전 상태가 그대로일 때만 바꿔, 같은 진입이 두 번 기록되지 않게 합니다
      const changed = await this.db
        .updateTable('member.safe_zones')
        .set({
          inside: crossing === 'enter',
          inside_since: crossing === 'enter' ? fix.measuredAt : null,
          updated_at: new Date(),
        })
        .where('id', '=', zone.id)
        .where('inside', '=', zone.inside)
        .returning('id')
        .executeTakeFirst();
      if (!changed) continue;

      await this.db
        .insertInto('member.safe_zone_events')
        .values({
          zone_id: zone.id,
          user_id: userId,
          kind: crossing,
          occurred_at: fix.measuredAt,
          latitude: fix.latitude,
          longitude: fix.longitude,
        })
        .execute();

      results.push(crossing);
      await this.notify(userId, zone.id, zone.name, crossing, fix);
    }
    return results;
  }

  /** 이 장소에 지정된 친구에게만 알립니다 (전체 친구가 아닙니다) */
  private async notify(userId: string, zoneId: string, zoneName: string, crossing: 'enter' | 'leave', fix: Fix) {
    const [recipients, me] = await Promise.all([
      this.db.selectFrom('member.safe_zone_recipients').select('friend_id').where('zone_id', '=', zoneId).execute(),
      this.db.selectFrom('member.users').select('nickname').where('id', '=', userId).executeTakeFirst(),
    ]);
    const friendIds = recipients.map((r) => r.friend_id);
    if (friendIds.length === 0) return;

    const nickname = me?.nickname ?? '친구';
    const body = crossing === 'enter' ? `${nickname}님이 ${zoneName}에 도착했어요` : `${nickname}님이 ${zoneName}에서 나갔어요`;

    this.gateway.emitGeofence(friendIds, {
      userId,
      nickname,
      zoneId,
      zoneName,
      kind: crossing,
      occurredAt: fix.measuredAt.toISOString(),
    });
    await this.push
      .sendToUsers(friendIds, {
        title: '라무핀',
        body,
        channel: 'general',
        route: `/journey/${userId}`,
        data: { zoneId, kind: crossing },
      })
      .catch((error: unknown) => this.logger.error(`지오펜스 푸시 실패: ${String(error)}`));
  }

  /** 알림 받을 친구를 통째로 다시 씁니다. 친구가 아닌 사람은 걸러 냅니다 */
  private async replaceRecipients(userId: string, zoneId: string, friendIds: string[], policy: Policy) {
    await this.db.deleteFrom('member.safe_zone_recipients').where('zone_id', '=', zoneId).execute();
    if (friendIds.length === 0) return;

    const limit = policyNumber(policy, 'geofenceAlertLimit', 0);
    const friends = await this.db
      .selectFrom('social.friendships')
      .select('friend_id')
      .where('user_id', '=', userId)
      .where('friend_id', 'in', friendIds)
      .execute();
    const allowed = friends.map((f) => f.friend_id).slice(0, limit);
    if (allowed.length === 0) return;

    await this.db
      .insertInto('member.safe_zone_recipients')
      .values(allowed.map((friendId) => ({ zone_id: zoneId, friend_id: friendId })))
      .execute();
  }

  /** 이 등급에서 진입·이탈 알림을 쓸 수 있는지. 만들기 전에 봅니다 */
  private assertCanAlert(policy: Policy, friendIds: string[]) {
    if (friendIds.length === 0) return;
    if (policyNumber(policy, 'geofenceAlertLimit', 0) === 0) {
      throw new BadRequestException('지금 등급에서는 진입·이탈 알림을 쓸 수 없습니다');
    }
  }

  private async one(userId: string, zoneId: string) {
    const zones = await this.list(userId);
    const found = zones.find((z) => z.id === zoneId);
    if (!found) throw new NotFoundException('안심장소를 찾을 수 없습니다');
    return found;
  }
}
