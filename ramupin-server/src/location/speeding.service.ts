import { Inject, Injectable, Logger } from '@nestjs/common';

import { ChatGateway } from '../chat/chat.gateway.js';
import { policyFeature, resolvePolicy } from '../config/policy.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { PushService } from '../push/push.service.js';
import { canNotifyAgain, peakSpeed, speedingSeconds, speedingStage, SPEEDING_KMH, type SpeedPoint } from './speeding.js';

/**
 * 과속 경고 (WBS 8.1).
 *
 * 위치가 저장될 때마다 최근 점들을 보고 판정합니다. 두 단계입니다.
 *   1. 기준을 **이어서** 넘으면 본인에게 경고
 *   2. 그래도 계속 넘으면 **보호자(친구)** 에게 알림
 *
 * 판정 자체는 `speeding.ts` 의 순수 함수에 있습니다 (단위 시험 있음).
 * 여기서는 정책 확인·알림 보내기·다시 안 울리게 하기만 합니다.
 */

/** 마지막으로 알린 시각. 사람 수만큼만 들고 있으면 되어 메모리에 둡니다 */
interface LastAlert {
  warnedAt: Date | null;
  guardianAt: Date | null;
}

@Injectable()
export class SpeedingService {
  private readonly logger = new Logger(SpeedingService.name);
  /**
   * 사람별 마지막 알림 시각.
   *
   * **DB 에 두지 않는 이유**: 서버가 다시 뜨면 비어도 됩니다. 그러면 최악의 경우
   * 경고가 한 번 더 가는 정도인데, 과속 경고는 한 번 더 가는 편이 안 가는 것보다 낫습니다.
   * 위치가 들어올 때마다 읽고 쓰는 값이라 DB 에 두면 저장 경로가 그만큼 느려집니다.
   */
  private readonly lastAlert = new Map<string, LastAlert>();

  constructor(
    @Inject(MAIN_DB) private readonly db: MainDb,
    private readonly gateway: ChatGateway,
    private readonly push: PushService,
  ) {}

  /**
   * 방금 들어온 위치들로 과속인지 봅니다.
   *
   * **예외를 밖으로 내지 않습니다.** 위치 저장은 이미 끝난 뒤라, 여기서 실패해도
   * 그 위치를 다시 처리하면 안 됩니다.
   */
  async check(userId: string, points: SpeedPoint[], now = new Date()): Promise<'none' | 'warn' | 'guardian'> {
    try {
      const seconds = speedingSeconds(points);
      const stage = speedingStage(seconds);
      if (stage === 'none') return 'none';

      const policy = await resolvePolicy(this.db, userId);
      if (!policyFeature(policy, 'speedingAlert')) return 'none';

      const speed = peakSpeed(points);
      const last = this.lastAlert.get(userId) ?? { warnedAt: null, guardianAt: null };

      if (stage === 'guardian' && canNotifyAgain(last.guardianAt, now)) {
        await this.notifyGuardians(userId, speed);
        this.lastAlert.set(userId, { ...last, guardianAt: now, warnedAt: now });
        return 'guardian';
      }
      if (canNotifyAgain(last.warnedAt, now)) {
        this.warnDriver(userId, speed);
        this.lastAlert.set(userId, { ...last, warnedAt: now });
        return 'warn';
      }
      return 'none';
    } catch (error) {
      this.logger.error(`과속 판정 실패 (user ${userId}): ${String(error)}`);
      return 'none';
    }
  }

  /**
   * 본인에게 경고.
   *
   * 푸시가 아니라 실시간으로 보냅니다 — 운전 중이라 앱이 켜져 있고, 즉시 떠야 합니다.
   */
  private warnDriver(userId: string, speedKmh: number) {
    this.gateway.emitSpeeding([userId], { kind: 'speeding', speedKmh, limitKmh: SPEEDING_KMH });
  }

  /** 이 사람의 과속 알림을 받겠다고 한 친구에게만 (친구별 맞춤 알림) */
  private async notifyGuardians(userId: string, speedKmh: number) {
    const [recipients, me] = await Promise.all([
      this.db
        .selectFrom('social.friend_alert_settings')
        .select('owner_id')
        .where('friend_id', '=', userId)
        .where('speeding', '=', true)
        .execute(),
      this.db.selectFrom('member.users').select('nickname').where('id', '=', userId).executeTakeFirst(),
    ]);
    // 본인에게는 계속 경고가 갑니다. 보호자만 여기서 다룹니다
    this.warnDriver(userId, speedKmh);

    const friendIds = recipients.map((r) => r.owner_id);
    if (friendIds.length === 0) return;

    const nickname = me?.nickname ?? '친구';
    this.gateway.emitSpeeding(friendIds, { kind: 'speedingFriend', userId, nickname, speedKmh });
    await this.push
      .sendToUsers(friendIds, {
        title: '라무핀 안전 알림',
        body: `${nickname}님이 ${speedKmh}km/h 로 이동 중이에요`,
        channel: 'danger',
        category: 'speeding',
        route: `/journey/${userId}`,
        data: { kind: 'speeding', speedKmh: String(speedKmh) },
      })
      .catch((error: unknown) => this.logger.error(`과속 푸시 실패: ${String(error)}`));
  }

  /** 다시 울릴 수 있게 기록을 비웁니다 (확인 스크립트용) */
  resetCooldown(userId: string) {
    this.lastAlert.delete(userId);
  }
}
