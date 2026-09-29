import { Inject, Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';

import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { PushService } from '../push/push.service.js';

/**
 * 예약 메시지 발송기 (WBS 8.2).
 *
 * **왜 서버가 보내나**: 예약을 건 사람 폰이 꺼져 있어도 가야 합니다.
 * 약 챙기기·병원 가기 같은 용도라 "폰이 켜져 있을 때만 감"은 쓸모가 없습니다.
 *
 * **서버가 여러 대여도 한 번만 갑니다**: 꺼낼 때 `FOR UPDATE SKIP LOCKED` 로 잠급니다.
 * 한 대가 집어 간 줄은 다른 대가 아예 못 봅니다. 잠금 없이 "안 보낸 것 조회 → 보내기"
 * 로 하면 두 대가 같은 줄을 동시에 집어 **같은 메시지가 두 번 갑니다.**
 */

/** 훑는 주기. 예약은 분 단위라 30초면 충분히 정확합니다 */
const INTERVAL_MS = 30_000;
/** 서버가 뜨자마자 한 번 돌리되, 시작 부하와 겹치지 않게 조금 미룹니다 */
const FIRST_RUN_DELAY_MS = 10_000;
/** 한 번에 처리하는 개수. 밀려 있어도 한 바퀴가 너무 길어지지 않게 */
const BATCH = 200;

/**
 * 이보다 오래 지난 것은 보내지 않습니다.
 *
 * 서버가 한참 꺼져 있다가 켜지면, 지난 예약이 한꺼번에 쏟아집니다.
 * 어젯밤 "약 드세요" 가 아침에 오면 도움이 안 되고 오히려 혼란스럽습니다.
 */
const TOO_LATE_MS = 60 * 60_000;

@Injectable()
export class ScheduledSenderService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(ScheduledSenderService.name);
  private timer: NodeJS.Timeout | null = null;
  private firstRun: NodeJS.Timeout | null = null;
  /** 한 바퀴가 길어졌을 때 다음 차례가 겹쳐 도는 것을 막습니다 */
  private running = false;

  constructor(
    @Inject(MAIN_DB) private readonly db: MainDb,
    private readonly push: PushService,
  ) {}

  onModuleInit() {
    this.firstRun = setTimeout(() => void this.run(), FIRST_RUN_DELAY_MS);
    this.timer = setInterval(() => void this.run(), INTERVAL_MS);
    this.logger.log('예약 메시지 발송기 시작');
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
    if (this.firstRun) clearTimeout(this.firstRun);
  }

  /** 한 바퀴. 배치와 확인 스크립트에서 부릅니다 */
  async run(now = new Date()): Promise<{ sent: number; skipped: number }> {
    if (this.running) return { sent: 0, skipped: 0 };
    this.running = true;
    try {
      return await this.sendDue(now);
    } catch (error) {
      // 30초 뒤 또 돕니다. 죽지 않고 로그만 남깁니다
      this.logger.error(`예약 메시지 발송 실패: ${String(error)}`);
      return { sent: 0, skipped: 0 };
    } finally {
      this.running = false;
    }
  }

  private async sendDue(now: Date) {
    let sent = 0;
    let skipped = 0;

    // 한 줄씩 트랜잭션을 여는 이유: 푸시 한 건이 늦어도 다른 줄의 잠금을 붙들지 않습니다
    for (const id of await this.dueIds(now)) {
      const result = await this.db.transaction().execute(async (trx) => {
        const row = await trx
          .selectFrom('member.scheduled_messages')
          .select(['id', 'user_id', 'target_id', 'title', 'body', 'tts', 'scheduled_at'])
          .where('id', '=', id)
          .where('sent_at', 'is', null)
          .forUpdate()
          .skipLocked()
          .executeTakeFirst();
        // 다른 서버가 먼저 집어 갔습니다
        if (!row) return 'taken' as const;

        const tooLate = now.getTime() - row.scheduled_at.getTime() > TOO_LATE_MS;
        const stillFriend = await trx
          .selectFrom('social.friendships')
          .select('friend_id')
          .where('user_id', '=', row.user_id)
          .where('friend_id', '=', row.target_id)
          .executeTakeFirst();

        const reason = tooLate ? '시간이 너무 지나 보내지 않았습니다' : !stillFriend ? '친구가 아니라 보내지 않았습니다' : null;

        // 보냈든 못 보냈든 **먼저 표시합니다.** 푸시가 실패해도 다시 집어 가지 않게 하려는 것입니다 —
        // 알림은 늦게 한 번 못 가는 것보다 여러 번 가는 쪽이 더 나쁩니다
        await trx
          .updateTable('member.scheduled_messages')
          .set({ sent_at: now, failed_reason: reason, updated_at: now })
          .where('id', '=', row.id)
          .execute();

        return reason ? ('skipped' as const) : { row };
      });

      if (result === 'taken') continue;
      if (result === 'skipped') {
        skipped += 1;
        continue;
      }

      const { row } = result;
      await this.push
        .sendToUsers([row.target_id], {
          title: row.title,
          body: row.body,
          channel: 'general',
          category: 'notice',
          route: '/settings/scheduled-messages',
          // 받는 폰이 소리로 읽어 줄지 판단합니다 (푸시 data 는 문자열만 담깁니다)
          data: { kind: 'scheduledMessage', tts: row.tts ? '1' : '0' },
        })
        .catch((error: unknown) => this.logger.error(`예약 메시지 푸시 실패 (${row.id}): ${String(error)}`));
      sent += 1;
    }

    if (sent || skipped) this.logger.log(`예약 메시지 ${sent}건 발송, ${skipped}건 건너뜀`);
    return { sent, skipped };
  }

  /** 보낼 때가 된 것들의 id. 잠금은 한 줄씩 따로 겁니다 */
  private async dueIds(now: Date) {
    const rows = await this.db
      .selectFrom('member.scheduled_messages')
      .select('id')
      .where('sent_at', 'is', null)
      .where('scheduled_at', '<=', now)
      .orderBy('scheduled_at', 'asc')
      .limit(BATCH)
      .execute();
    return rows.map((r) => r.id);
  }
}
