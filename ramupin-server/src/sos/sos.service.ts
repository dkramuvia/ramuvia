import { Inject, Injectable, Logger } from '@nestjs/common';

import { ChatGateway } from '../chat/chat.gateway.js';
import { appError } from '../common/app-error.js';
import { policyNumber, resolvePolicy } from '../config/policy.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { PushService } from '../push/push.service.js';

/**
 * SOS (WBS 7.9 / 8.3 / 9.3 / 10.8).
 *
 * 앱은 위치와 녹음만 올리고, 누구에게 어떻게 알릴지는 전부 서버가 정합니다.
 * 지정한 수신인이 없으면 **회사(모니터링 사이트)가 받습니다** — 혼자 사는 분이
 * 수신인을 등록하지 않았다고 해서 아무 데도 안 가면 안 되기 때문입니다 (WBS 9.3).
 */

export interface SosInput {
  startedAt: Date;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  placeName: string | null;
  placeAddress: string | null;
  /** 녹음 파일. 사진과 같은 저장소에 먼저 올린 뒤 그 id 를 줍니다 */
  audioAssetId: string | null;
}

@Injectable()
export class SosService {
  private readonly logger = new Logger(SosService.name);

  constructor(
    @Inject(MAIN_DB) private readonly db: MainDb,
    private readonly gateway: ChatGateway,
    private readonly push: PushService,
  ) {}

  async send(userId: string, input: SosInput) {
    const me = await this.db
      .selectFrom('member.users as u')
      .leftJoin('member.safety_settings as s', 's.user_id', 'u.id')
      .select(['u.nickname', 's.sos_enabled as sosEnabled'])
      .where('u.id', '=', userId)
      .executeTakeFirst();
    if (!me) throw appError(404, 'USER_NOT_FOUND', '사용자를 찾을 수 없습니다');
    // 설정이 없으면 켜진 것으로 봅니다. 안전 기능은 꺼 달라고 해야 꺼집니다
    if (me.sosEnabled === false) throw appError(403, 'SOS_DISABLED', 'SOS 기능이 꺼져 있습니다');

    const recipients = await this.resolveRecipients(userId);
    const toMonitoring = recipients.length === 0;

    const event = await this.db
      .insertInto('member.sos_events')
      .values({
        user_id: userId,
        started_at: input.startedAt,
        latitude: input.latitude,
        longitude: input.longitude,
        altitude: input.altitude,
        place_name: input.placeName,
        place_address: input.placeAddress,
        audio_asset_id: input.audioAssetId,
        recipient_count: recipients.length,
        to_monitoring: toMonitoring,
      })
      .returning(['id', 'created_at'])
      .executeTakeFirstOrThrow();

    if (recipients.length > 0) {
      await this.db
        .insertInto('member.sos_deliveries')
        .values(recipients.map((id) => ({ sos_id: event.id, recipient_user_id: id })))
        .execute();
      await this.notify(recipients, event.id, userId, me.nickname, input);
    } else {
      // 모니터링 사이트가 이 표를 읽어 보여 주고, 전화는 사람이 겁니다
      this.logger.warn(`SOS 수신인 없음 → 모니터링 (user ${userId})`);
    }

    return { sosId: event.id, recipientCount: recipients.length, toMonitoring };
  }

  /** 카운트다운 중 취소. 이미 보낸 건도 "취소됨"으로 바꿔 수신인에게 알립니다 */
  async cancel(userId: string, sosId: string) {
    const updated = await this.db
      .updateTable('member.sos_events')
      .set({ status: 'cancelled', cancelled_at: new Date() })
      .where('id', '=', sosId)
      .where('user_id', '=', userId)
      .where('status', '=', 'sent')
      .returning('id')
      .executeTakeFirst();
    if (!updated) throw appError(404, 'SOS_NOT_FOUND', '취소할 SOS 가 없습니다');

    const recipients = await this.deliveredTo(sosId);
    if (recipients.length > 0) {
      // 놀란 사람들에게 "괜찮다"를 알려 주는 것도 중요합니다
      this.gateway.emitSos(recipients, { sosId, status: 'cancelled' });
      await this.push
        .sendToUsers(recipients, {
          title: '라무핀',
          body: 'SOS 가 취소되었습니다.',
          channel: 'sos',
          route: '/settings/history',
          data: { sosId, status: 'cancelled' },
        })
        .catch((error: unknown) => this.logger.error(`취소 알림 실패: ${String(error)}`));
    }
    return { ok: true };
  }

  /** 내가 받은 SOS 목록 (앱 알림 보관함) */
  async received(userId: string, limit = 50) {
    return this.db
      .selectFrom('member.sos_events as e')
      .innerJoin('member.sos_deliveries as d', 'd.sos_id', 'e.id')
      .innerJoin('member.users as u', 'u.id', 'e.user_id')
      .select([
        'e.id',
        'e.user_id as userId',
        'u.nickname',
        'e.latitude',
        'e.longitude',
        'e.place_name as placeName',
        'e.place_address as placeAddress',
        'e.status',
        'e.started_at as startedAt',
        'e.created_at as createdAt',
        'd.read_at as readAt',
      ])
      .where('d.recipient_user_id', '=', userId)
      .orderBy('e.created_at', 'desc')
      .limit(limit)
      .execute();
  }

  /**
   * 받을 사람을 정합니다.
   * 직접 고른 친구 + 고른 그룹방의 멤버를 합치고, 나 자신과 중복은 뺍니다.
   */
  private async resolveRecipients(userId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('member.sos_recipients')
      .select(['kind', 'target_id'])
      .where('user_id', '=', userId)
      .execute();
    if (rows.length === 0) return [];

    const friendIds = rows.filter((r) => r.kind === 'friend').map((r) => r.target_id);
    const groupIds = rows.filter((r) => r.kind === 'group').map((r) => r.target_id);

    const ids = new Set<string>();
    if (friendIds.length > 0) {
      // 친구 관계가 끊겼는데 수신인에 남아 있을 수 있으므로 지금도 친구인지 확인합니다
      const friends = await this.db
        .selectFrom('social.friendships')
        .select('friend_id')
        .where('user_id', '=', userId)
        .where('friend_id', 'in', friendIds)
        .execute();
      for (const row of friends) ids.add(row.friend_id);
    }
    if (groupIds.length > 0) {
      const members = await this.db
        .selectFrom('social.group_members')
        .select('user_id')
        .where('group_id', 'in', groupIds)
        .execute();
      for (const row of members) ids.add(row.user_id);
    }
    ids.delete(userId);

    // 등급별 수신인 수 제한 (WBS 2.1). 관리자 화면에서 조정합니다
    const policy = await resolvePolicy(this.db, userId);
    return [...ids].slice(0, policyNumber(policy, 'sosRecipientLimit', 1));
  }

  private async deliveredTo(sosId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('member.sos_deliveries')
      .select('recipient_user_id')
      .where('sos_id', '=', sosId)
      .execute();
    return rows.map((r) => r.recipient_user_id);
  }

  private async notify(recipients: string[], sosId: string, userId: string, nickname: string, input: SosInput) {
    const where = input.placeName ?? input.placeAddress ?? '위치 확인 필요';
    this.gateway.emitSos(recipients, {
      sosId,
      userId,
      nickname,
      latitude: input.latitude,
      longitude: input.longitude,
      placeName: input.placeName,
      placeAddress: input.placeAddress,
      startedAt: input.startedAt.toISOString(),
      // 팝업에 "음성 있음"을 표시할지. 녹음 업로드가 실패해도 SOS 는 보냅니다
      hasAudio: input.audioAssetId != null,
    });
    // 앱이 꺼져 있어도 닿아야 합니다. SOS 는 놓치면 안 되는 알림입니다
    await this.push
      .sendToUsers(recipients, {
        title: `${nickname}님의 SOS 긴급 발신`,
        body: `${where} · 지금 확인해 주세요`,
        channel: 'sos',
        route: '/sos-received',
        data: { sosId, userId },
      })
      .catch((error: unknown) => this.logger.error(`SOS 푸시 실패: ${String(error)}`));
  }
}
