import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';

import { appError } from '../common/app-error.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';

/**
 * 신고 · 차단 (보완 화면 설계 4.11).
 *
 * 차단: 바로 양방향 위치 공유와 대화를 끊고 상대에게 알리지 않습니다.
 *   - 친구였으면 친구 삭제와 똑같이 정리합니다 (공유·알림·SOS·안심존 수신·예약 메시지)
 *   - 오가는 친구 요청은 닫습니다. 이후 서로 요청·1:1 대화를 못 합니다 (common/blocks.ts)
 * 신고: 운영자 검토 대기열(member.reports)로. 차단도 함께 할 수 있습니다 (기본 체크).
 */

export const reportBody = z.object({
  targetUserId: z.uuid(),
  targetKind: z.enum(['message', 'photo', 'profile']),
  targetId: z.uuid().nullish(),
  reason: z.enum(['spam', 'harassment', 'tracking', 'inappropriate', 'other']),
  detail: z.string().trim().max(500).nullish(),
  block: z.boolean().default(true),
});

export type ReportInput = z.infer<typeof reportBody>;

@Injectable()
export class BlocksService {
  private readonly logger = new Logger(BlocksService.name);

  constructor(@Inject(MAIN_DB) private readonly db: MainDb) {}

  /**
   * @param removeFriend 친구 삭제 (FriendsService.remove). 친구가 아니면 던지므로 여기서 삼킵니다
   */
  async block(me: string, targetId: string, removeFriend: (me: string, friendId: string) => Promise<void>) {
    if (me === targetId) throw appError(HttpStatus.BAD_REQUEST, 'CANNOT_BLOCK_SELF', '나를 차단할 수 없습니다');
    const target = await this.db.selectFrom('member.users').select('id').where('id', '=', targetId).executeTakeFirst();
    if (!target) throw appError(HttpStatus.NOT_FOUND, 'USER_NOT_FOUND', '사용자가 없습니다');

    await this.db.insertInto('social.blocks').values({ blocker_id: me, blocked_id: targetId }).onConflict((oc) => oc.doNothing()).execute();
    await removeFriend(me, targetId).catch(() => undefined);
    // 오가던 친구 요청을 닫습니다. 상대가 보낸 것은 "거절" 로 두어 상대 화면에는 만료처럼 보입니다
    await this.db
      .updateTable('social.friend_requests')
      .set({ status: 'rejected', responded_at: new Date() })
      .where('status', '=', 'pending')
      .where((eb) =>
        eb.or([eb.and([eb('from_user_id', '=', me), eb('to_user_id', '=', targetId)]), eb.and([eb('from_user_id', '=', targetId), eb('to_user_id', '=', me)])]),
      )
      .execute();
    return { ok: true };
  }

  async unblock(me: string, targetId: string) {
    await this.db.deleteFrom('social.blocks').where('blocker_id', '=', me).where('blocked_id', '=', targetId).execute();
    return { ok: true };
  }

  /** 내가 차단한 사람 (설정 › 친구 관리에서 풀 때) */
  async list(me: string) {
    const rows = await this.db
      .selectFrom('social.blocks as b')
      .innerJoin('member.users as u', 'u.id', 'b.blocked_id')
      .select(['u.id', 'u.nickname', 'u.avatar_url as avatarUrl', 'b.created_at as blockedAt'])
      .where('b.blocker_id', '=', me)
      .orderBy('b.created_at', 'desc')
      .execute();
    return rows.map((r) => ({ ...r, blockedAt: r.blockedAt.toISOString() }));
  }

  async report(me: string, input: ReportInput, removeFriend: (me: string, friendId: string) => Promise<void>) {
    if (me === input.targetUserId) throw appError(HttpStatus.BAD_REQUEST, 'CANNOT_REPORT_SELF', '나를 신고할 수 없습니다');
    const preview = await this.previewOf(me, input);

    await this.db
      .insertInto('member.reports')
      .values({
        reporter_id: me,
        target_user_id: input.targetUserId,
        target_kind: input.targetKind,
        target_id: input.targetId ?? null,
        reason: input.reason,
        detail: input.detail ?? null,
        preview,
      })
      .execute();
    this.logger.warn(`신고 접수: ${input.reason} (${input.targetKind})`);

    if (input.block) await this.block(me, input.targetUserId, removeFriend);
    return { ok: true };
  }

  /**
   * 신고한 메시지 글을 함께 남깁니다 (원본이 지워져도 검토할 수 있게).
   * 내가 볼 수 있는 대화방의, 신고 대상이 쓴 메시지만 받습니다 — 남의 대화를 신고로 꺼내 볼 수 없게.
   */
  private async previewOf(me: string, input: ReportInput): Promise<string | null> {
    if (input.targetKind !== 'message' || !input.targetId) return null;
    const message = await this.db
      .selectFrom('chat.messages as msg')
      .innerJoin('social.group_members as m', (join) => join.onRef('m.group_id', '=', 'msg.room_id').on('m.user_id', '=', me))
      .select('msg.text')
      .where('msg.id', '=', input.targetId)
      .where('msg.sender_id', '=', input.targetUserId)
      .executeTakeFirst();
    if (!message) throw appError(HttpStatus.NOT_FOUND, 'MESSAGE_NOT_FOUND', '신고할 메시지를 찾을 수 없습니다');
    return message.text;
  }
}
