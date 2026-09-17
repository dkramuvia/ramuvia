import { Inject, Injectable, Logger } from '@nestjs/common';

import { ChatGateway } from '../chat/chat.gateway.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { LocationService } from '../location/location.service.js';
import { detect, type AnomalyTarget, type AnomalyTrack, type Detection } from './anomaly.rules.js';

/**
 * 이상징후 감시 (docs/anomaly-alerts.md).
 *
 * 폰이 꺼지면 앱은 아무것도 못 하므로, "48시간 무응답" 같은 판단은 서버만 할 수 있습니다.
 * 그래서 이 서비스가 주기적으로 전체 사용자의 마지막 상태를 훑습니다.
 *
 * 한 번 돌 때 하는 일
 *   1. location.user_status 를 읽어 지금 열려 있어야 하는 단계를 계산
 *   2. 새로 생긴 단계 → member.anomaly_events 에 기록하고 알림
 *   3. 더 이상 해당하지 않는 단계 → 해제(cleared_at). 기록은 지우지 않습니다
 */
@Injectable()
export class AnomalyService {
  private readonly logger = new Logger(AnomalyService.name);

  constructor(
    @Inject(MAIN_DB) private readonly db: MainDb,
    private readonly location: LocationService,
    private readonly gateway: ChatGateway,
  ) {}

  /** 한 바퀴 돌립니다. 배치(스케줄러)와 테스트에서 부릅니다 */
  async sweep(now = new Date()): Promise<{ opened: number; cleared: number }> {
    const statuses = await this.location.listStatuses();
    if (statuses.length === 0) return { opened: 0, cleared: 0 };

    const userIds = statuses.map((s) => s.userId);
    const users = await this.db
      .selectFrom('member.users')
      .select(['id', 'nickname', 'single_household'])
      .where('id', 'in', userIds)
      .where('status', '=', 'active')
      .execute();
    const userById = new Map(users.map((u) => [u.id, u]));

    const open = await this.db
      .selectFrom('member.anomaly_events')
      .select(['id', 'user_id', 'track', 'stage'])
      .where('cleared_at', 'is', null)
      .where('user_id', 'in', userIds)
      .execute();

    const openKeys = new Set(open.map((e) => key(e.user_id, e.track, e.stage)));
    const stillOpen = new Set<string>();
    let opened = 0;

    for (const status of statuses) {
      const user = userById.get(status.userId);
      // 탈퇴·정지된 사용자는 감시하지 않습니다
      if (!user) continue;

      const found = detect(
        status,
        now,
      );

      for (const detection of found) {
        stillOpen.add(key(status.userId, detection.track, detection.stage));
        if (openKeys.has(key(status.userId, detection.track, detection.stage))) continue;
        // 1인단독은 친구가 아니라 모니터링 사이트로 (09-17 확정)
        const target: AnomalyTarget = user.single_household ? 'monitoring' : 'friends';
        await this.open(status.userId, user.nickname, detection, target, now);
        opened += 1;
      }
    }

    // 더 이상 해당하지 않는 단계는 해제 (다시 움직였거나 전화기를 켰음)
    const toClear = open.filter((e) => !stillOpen.has(key(e.user_id, e.track, e.stage))).map((e) => e.id);
    if (toClear.length > 0) {
      await this.db.updateTable('member.anomaly_events').set({ cleared_at: now }).where('id', 'in', toClear).execute();
    }

    if (opened > 0 || toClear.length > 0) {
      this.logger.log(`이상징후 감시: 새로 ${opened}건, 해제 ${toClear.length}건`);
    }
    return { opened, cleared: toClear.length };
  }

  private async open(userId: string, nickname: string, detection: Detection, target: AnomalyTarget, now: Date) {
    await this.db
      .insertInto('member.anomaly_events')
      .values({ user_id: userId, track: detection.track, stage: detection.stage, target, detected_at: now })
      // 여러 서버가 동시에 돌아도 같은 단계가 두 번 들어가지 않게 (부분 유니크 인덱스)
      .onConflict((oc) => oc.doNothing())
      .execute();

    if (target === 'friends') {
      const friendIds = await this.friendIds(userId);
      this.gateway.emitAnomaly(friendIds, {
        userId,
        nickname,
        track: detection.track,
        stage: detection.stage,
        detectedAt: now.toISOString(),
      });
      // TODO(6단계): 앱이 꺼져 있을 때를 위해 푸시(FCM) 발송
    }
    // monitoring 은 따로 보내지 않습니다. 모니터링 사이트가 이 표를 읽어 보여 주고, 전화는 사람이 합니다
  }

  /** 나를 친구로 등록한 사람들 (내 이상징후를 받아야 할 사람) */
  private async friendIds(userId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('social.friendships')
      .select('user_id')
      .where('friend_id', '=', userId)
      .execute();
    return rows.map((r) => r.user_id);
  }

  /** 모니터링 사이트 목록: 아직 안 풀린 이상징후 */
  async openEvents(limit = 100) {
    return this.db
      .selectFrom('member.anomaly_events as a')
      .innerJoin('member.users as u', 'u.id', 'a.user_id')
      .select([
        'a.id',
        'a.user_id as userId',
        'u.nickname',
        'u.public_id as publicId',
        'u.single_household as singleHousehold',
        'a.track',
        'a.stage',
        'a.target',
        'a.detected_at as detectedAt',
        'a.acknowledged_at as acknowledgedAt',
      ])
      .where('a.cleared_at', 'is', null)
      .orderBy('a.detected_at', 'desc')
      .limit(limit)
      .execute();
  }

  /** 모니터링 사이트에서 "확인함" 표시 (전화는 사람이 직접 겁니다) */
  async acknowledge(eventId: string) {
    await this.db
      .updateTable('member.anomaly_events')
      .set({ acknowledged_at: new Date() })
      .where('id', '=', eventId)
      .where('cleared_at', 'is', null)
      .execute();
  }
}

const key = (userId: string, track: string, stage: string) => `${userId}|${track}|${stage}`;

export type { AnomalyTrack };
