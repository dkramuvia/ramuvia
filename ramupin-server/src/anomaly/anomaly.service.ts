import { Inject, Injectable, Logger } from '@nestjs/common';

import { ChatGateway } from '../chat/chat.gateway.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { LocationService } from '../location/location.service.js';
import { PushService } from '../push/push.service.js';
import { ANOMALY_RULES, detect, type AnomalyTarget, type AnomalyTrack, type Detection } from './anomaly.rules.js';

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
/**
 * 감시가 훑을 대상을 정하는 기준.
 *
 * ANOMALY_RULES 의 **가장 이른 단계**를 씁니다. 이보다 늦게 잡으면 첫 단계를 놓치고,
 * 이르게 잡으면 쓸데없이 많이 가져옵니다. 규칙을 바꾸면 여기도 같이 바꿔야 합니다
 * (anomaly.rules.spec.ts 가 어긋나면 잡아 줍니다).
 */
const SWEEP_THRESHOLDS = {
  noSignalMinutes: ANOMALY_RULES.noSignal[0].afterMinutes,
  fixedMinutes: ANOMALY_RULES.gpsFixed[0].afterMinutes,
  lowBatteryPercent: ANOMALY_RULES.lowBatteryPercent,
};

@Injectable()
export class AnomalyService {
  private readonly logger = new Logger(AnomalyService.name);

  constructor(
    @Inject(MAIN_DB) private readonly db: MainDb,
    private readonly location: LocationService,
    private readonly gateway: ChatGateway,
    private readonly push: PushService,
  ) {}

  /** 한 바퀴 돌립니다. 배치(스케줄러)와 테스트에서 부릅니다 */
  async sweep(now = new Date()): Promise<{ opened: number; cleared: number }> {
    // 1) 지금 열려 있는 건부터 봅니다. 실제 이상징후만이라 수가 적습니다
    const open = await this.db
      .selectFrom('member.anomaly_events')
      .select(['id', 'user_id', 'track', 'stage'])
      .where('cleared_at', 'is', null)
      .execute();

    // 2) 조건에 해당하는 사람 + 열려 있는 사람만 가져옵니다.
    //    열려 있는 사람을 빼면 "다시 움직였으니 해제" 를 영영 못 합니다
    const openUserIds = [...new Set(open.map((e) => e.user_id))];
    const statuses = await this.location.listStatusesToCheck(SWEEP_THRESHOLDS, openUserIds);
    if (statuses.length === 0) return { opened: 0, cleared: 0 };

    const userIds = statuses.map((s) => s.userId);
    const users = await this.db
      .selectFrom('member.users')
      .select(['id', 'nickname', 'single_household'])
      .where('id', 'in', userIds)
      .where('status', '=', 'active')
      .execute();
    const userById = new Map(users.map((u) => [u.id, u]));

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

    // 더 이상 해당하지 않는 단계는 해제 (다시 움직였거나 전화기를 켰음).
    // 이번에 상태를 확인한 사람만 판단합니다. 위치 기록이 아예 없어진 사람을
    // "해제" 로 처리하면 실제로는 위험한데 목록에서 사라질 수 있습니다
    const checked = new Set(userIds);
    const toClear = open
      .filter((e) => checked.has(e.user_id) && !stillOpen.has(key(e.user_id, e.track, e.stage)))
      .map((e) => e.id);
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
      // 앱이 꺼져 있을 때는 WebSocket 이 닿지 않으므로 푸시로도 보냅니다
      await this.push
        .sendToUsers(friendIds, {
          title: '라무핀 안전 알림',
          body: messageFor(nickname, detection),
          channel: 'anomaly',
          route: `/journey/${userId}`,
          data: { track: detection.track, stage: detection.stage },
        })
        .catch((error: unknown) => this.logger.error(`푸시 실패: ${String(error)}`));
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

  /**
   * 모니터링 사이트 상세: 이 사람이 지금 어떤 상태인지.
   * 전화를 걸지 말지 판단하는 데 필요한 것만 모읍니다 (마지막 위치·배터리·언제부터 그 자리인지).
   */
  async userDetail(publicId: string) {
    const user = await this.db
      .selectFrom('member.users')
      .select(['id', 'public_id as publicId', 'nickname', 'plan', 'single_household as singleHousehold', 'last_active_at as lastActiveAt'])
      .where('public_id', '=', publicId)
      .executeTakeFirst();
    if (!user) return null;

    const status = await this.location.getStatus(user.id);

    // 지난 기록까지 같이 봅니다. "처음인지 늘 그러시는지"로 판단이 갈립니다
    const events = await this.db
      .selectFrom('member.anomaly_events')
      .select(['id', 'track', 'stage', 'target', 'detected_at as detectedAt', 'cleared_at as clearedAt', 'acknowledged_at as acknowledgedAt'])
      .where('user_id', '=', user.id)
      .orderBy('detected_at', 'desc')
      .limit(30)
      .execute();

    return { user, status, events };
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

/** 친구에게 보여줄 문구 (docs/anomaly-alerts.md 의 메시지) */
function messageFor(nickname: string, detection: Detection): string {
  const hours = detection.stage.endsWith('h') ? detection.stage.replace('h', '시간') : null;
  switch (detection.track) {
    case 'battery':
      if (detection.stage === 'low') return `${nickname}님의 배터리가 부족합니다`;
      if (detection.stage === 'zero') return `${nickname}님의 전화기가 꺼졌습니다`;
      return `${nickname}님의 전화기가 꺼진 지 ${hours}이 되었습니다. 확인 바랍니다`;
    case 'gps_fixed':
      return `${nickname}님의 위치가 ${hours} 고정되었습니다`;
    case 'fixed_battery_zero':
    case 'fixed_charging':
      return `${nickname}님의 안전을 확인하세요`;
    case 'no_signal':
      return `${nickname}님의 위치 신호가 확인되지 않습니다`;
  }
}
