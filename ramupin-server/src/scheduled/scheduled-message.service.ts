import { Inject, Injectable, Logger } from '@nestjs/common';

import { appError } from '../common/app-error.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';

/** 앱에 돌려주는 모양 (src/types/models.ts 의 ScheduledMessage) */
export interface ScheduledMessageResponse {
  id: string;
  targetUserId: string;
  title: string;
  body: string;
  scheduledAt: string;
  tts: boolean;
  /** 이미 보냈는지. 앱 목록에서 지난 예약을 흐리게 보여 줄 때 씁니다 */
  sent: boolean;
}

export interface ScheduledMessageInput {
  targetUserId: string;
  title: string;
  body: string;
  scheduledAt: Date;
  tts: boolean;
  /** 받는 사람 시각 기준으로 고른 날짜·시각 "2026-10-27T08:00" (있으면 scheduledAt 대신 이걸로 계산) */
  recipientLocalTime?: string;
}

/** 이 시각(UTC)에 그 시간대의 시계가 UTC 보다 몇 ms 앞서 있는지 */
function offsetMs(at: number, timezone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: timezone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date(at))
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, Number(p.value)]),
  );
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - Math.floor(at / 1000) * 1000;
}

/**
 * 그 시간대의 벽시계 "2026-10-27T08:00" 가 실제로 언제(UTC)인지.
 * 서머타임으로 시차가 바뀌는 날도 맞게, 구한 시각의 시차로 한 번 더 맞춥니다
 */
export function wallTimeToUtc(local: string, timezone: string): Date {
  const [date, time] = local.split('T');
  const [y, m, d] = date!.split('-').map(Number);
  const [hh, mm] = time!.split(':').map(Number);
  const guess = Date.UTC(y!, m! - 1, d!, hh!, mm!);
  let tz = timezone;
  try {
    offsetMs(guess, tz);
  } catch {
    tz = 'Asia/Seoul';
  }
  const first = guess - offsetMs(guess, tz);
  return new Date(guess - offsetMs(first, tz));
}

/**
 * 예약 메시지 (WBS 8.2).
 *
 * 내가 친구에게 "언제 무슨 말을 해 줘라" 를 걸어 둡니다.
 * **보내는 것은 서버가 합니다** — 약 챙기기·병원 가기 같은 용도라, 건 사람 폰이 꺼져 있어도
 * 가야 합니다.
 */
@Injectable()
export class ScheduledMessageService {
  private readonly logger = new Logger(ScheduledMessageService.name);

  constructor(@Inject(MAIN_DB) private readonly db: MainDb) {}

  async list(userId: string): Promise<ScheduledMessageResponse[]> {
    const rows = await this.db
      .selectFrom('member.scheduled_messages')
      .select(['id', 'target_id', 'title', 'body', 'scheduled_at', 'tts', 'sent_at'])
      .where('user_id', '=', userId)
      .orderBy('scheduled_at', 'asc')
      .execute();
    return rows.map((r) => ({
      id: r.id,
      targetUserId: r.target_id,
      title: r.title,
      body: r.body,
      scheduledAt: r.scheduled_at.toISOString(),
      tts: r.tts,
      sent: r.sent_at != null,
    }));
  }

  /** 받는 사람 시각 기준이면 받는 사람의 시간대(알림 설정에 기기가 저장해 둔 값)로 실제 시각을 구합니다 */
  private async resolveScheduledAt(input: ScheduledMessageInput): Promise<Date> {
    if (!input.recipientLocalTime) return input.scheduledAt;
    const row = await this.db
      .selectFrom('member.notification_settings')
      .select('timezone')
      .where('user_id', '=', input.targetUserId)
      .executeTakeFirst();
    return wallTimeToUtc(input.recipientLocalTime, row?.timezone ?? 'Asia/Seoul');
  }

  async create(userId: string, input: ScheduledMessageInput): Promise<ScheduledMessageResponse> {
    await this.assertFriend(userId, input.targetUserId);
    const scheduledAt = await this.resolveScheduledAt(input);
    const row = await this.db
      .insertInto('member.scheduled_messages')
      .values({
        user_id: userId,
        target_id: input.targetUserId,
        title: input.title,
        body: input.body,
        scheduled_at: scheduledAt,
        tts: input.tts,
      })
      .returning(['id', 'target_id', 'title', 'body', 'scheduled_at', 'tts', 'sent_at'])
      .executeTakeFirstOrThrow();
    return {
      id: row.id,
      targetUserId: row.target_id,
      title: row.title,
      body: row.body,
      scheduledAt: row.scheduled_at.toISOString(),
      tts: row.tts,
      sent: false,
    };
  }

  /**
   * 고치기.
   *
   * **이미 보낸 것은 못 고칩니다.** 고치게 두면 목록에는 새 내용이 보이는데 상대가 받은 것은
   * 예전 내용이라, 무엇이 갔는지 알 수 없게 됩니다.
   */
  async update(userId: string, id: string, input: ScheduledMessageInput): Promise<ScheduledMessageResponse> {
    await this.assertFriend(userId, input.targetUserId);
    const scheduledAt = await this.resolveScheduledAt(input);
    const row = await this.db
      .updateTable('member.scheduled_messages')
      .set({
        target_id: input.targetUserId,
        title: input.title,
        body: input.body,
        scheduled_at: scheduledAt,
        tts: input.tts,
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .where('sent_at', 'is', null)
      .returning(['id', 'target_id', 'title', 'body', 'scheduled_at', 'tts'])
      .executeTakeFirst();
    if (!row) throw appError(404, 'SCHEDULED_MESSAGE_NOT_FOUND', '고칠 수 있는 예약 메시지가 없습니다');
    return {
      id: row.id,
      targetUserId: row.target_id,
      title: row.title,
      body: row.body,
      scheduledAt: row.scheduled_at.toISOString(),
      tts: row.tts,
      sent: false,
    };
  }

  async remove(userId: string, id: string): Promise<{ ok: true }> {
    const row = await this.db
      .deleteFrom('member.scheduled_messages')
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .returning('id')
      .executeTakeFirst();
    if (!row) throw appError(404, 'SCHEDULED_MESSAGE_NOT_FOUND', '예약 메시지가 없습니다');
    return { ok: true };
  }

  /** 아직 친구인지. 친구를 끊은 뒤에도 예약이 남아 메시지가 가면 안 됩니다 */
  private async assertFriend(userId: string, targetId: string) {
    if (userId === targetId) throw appError(400, 'SELF_NOT_ALLOWED', '나에게는 예약할 수 없습니다');
    const friend = await this.db
      .selectFrom('social.friendships')
      .select('friend_id')
      .where('user_id', '=', userId)
      .where('friend_id', '=', targetId)
      .executeTakeFirst();
    if (!friend) throw appError(404, 'NOT_FRIEND', '친구가 아닙니다');
  }
}
