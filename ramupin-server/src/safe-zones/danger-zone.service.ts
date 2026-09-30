import { Inject, Injectable, Logger } from '@nestjs/common';

import { ChatGateway } from '../chat/chat.gateway.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { PushService } from '../push/push.service.js';
import { judgeCrossing, type Fix } from './zone-crossing.js';

/**
 * 위험지역 알림 (WBS 9.6).
 *
 * 낙석 주의 구간·침수 구역처럼 **모두에게 공통인** 위험한 곳입니다.
 * 안심장소와 달리 사람마다 정하는 것이 아니라 서비스가 정해서 모두에게 적용합니다.
 *
 * **알림은 본인에게 갑니다.** 안심장소는 친구(보호자)에게 알리지만, 위험지역은
 * 지금 그곳에 있는 본인이 알아야 피할 수 있습니다.
 *
 * 들어갔는지 판정은 안심장소와 **같은 함수**를 씁니다 (`zone-crossing.ts`).
 * 경계에서 들락거리는 것을 막는 규칙이 똑같이 필요하고, 두 벌로 두면 한쪽만 고쳐집니다.
 *
 * TODO(자료 대기): `config.danger_zones` 가 **비어 있습니다.** 공공데이터를 받아 넣어야
 * 실제로 동작합니다. 어디서 어떻게 받는지는 `docs/danger-zone-data.md` 에 정리해 두었습니다.
 * 요약하면 — 표준데이터에는 **좌표가 없어** 주소를 좌표로 바꿔 넣어야 하고,
 * **반경은 자료에 없어 유형별로 우리가 정해야 합니다.** 대표님 인증키 신청이 먼저입니다.
 */

/** 같은 곳에 대해 이 시간 안에는 다시 알리지 않습니다 */
const REPEAT_COOLDOWN_MS = 60 * 60_000;

@Injectable()
export class DangerZoneService {
  private readonly logger = new Logger(DangerZoneService.name);

  constructor(
    @Inject(MAIN_DB) private readonly db: MainDb,
    private readonly gateway: ChatGateway,
    private readonly push: PushService,
  ) {}

  /**
   * 위험지역에 들어갔는지 봅니다.
   *
   * **예외를 밖으로 내지 않습니다.** 위치 저장은 이미 끝난 뒤라, 여기서 실패해도
   * 그 위치를 다시 처리하면 안 됩니다.
   */
  async check(userId: string, fix: Fix, now = new Date()): Promise<string[]> {
    try {
      return await this.checkInner(userId, fix, now);
    } catch (error) {
      this.logger.error(`위험지역 판정 실패 (user ${userId}): ${String(error)}`);
      return [];
    }
  }

  private async checkInner(userId: string, fix: Fix, now: Date): Promise<string[]> {
    const zones = await this.db
      .selectFrom('config.danger_zones as z')
      .leftJoin('member.danger_zone_visits as v', (join) => join.onRef('v.zone_id', '=', 'z.id').on('v.user_id', '=', userId))
      .select(['z.id', 'z.name', 'z.kind', 'z.latitude', 'z.longitude', 'z.radius_m', 'v.inside', 'v.notified_at'])
      .where('z.enabled', '=', true)
      .execute();
    if (zones.length === 0) return [];

    const entered: string[] = [];
    for (const zone of zones) {
      const crossing = judgeCrossing(
        { latitude: zone.latitude, longitude: zone.longitude, radiusM: zone.radius_m, inside: zone.inside ?? false },
        fix,
      );
      if (!crossing) continue;

      const inside = crossing === 'enter';
      await this.db
        .insertInto('member.danger_zone_visits')
        .values({ user_id: userId, zone_id: zone.id, inside, entered_at: inside ? now : null })
        .onConflict((oc) =>
          oc.columns(['user_id', 'zone_id']).doUpdateSet((eb) => ({
            inside: eb.ref('excluded.inside'),
            entered_at: eb.ref('excluded.entered_at'),
          })),
        )
        .execute();

      // 나갈 때는 알리지 않습니다. "위험한 곳을 벗어났다" 는 급한 소식이 아닙니다
      if (!inside) continue;
      // 같은 곳을 오가며 계속 울리지 않게
      if (zone.notified_at && now.getTime() - zone.notified_at.getTime() < REPEAT_COOLDOWN_MS) continue;

      await this.db
        .updateTable('member.danger_zone_visits')
        .set({ notified_at: now })
        .where('user_id', '=', userId)
        .where('zone_id', '=', zone.id)
        .execute();

      entered.push(zone.id);
      await this.notify(userId, zone.name, zone.kind, fix);
    }
    return entered;
  }

  /** 지금 그곳에 있는 본인에게 */
  private async notify(userId: string, zoneName: string, kind: string, fix: Fix) {
    this.gateway.emitDangerZone([userId], {
      kind: 'dangerZone',
      zoneName,
      zoneKind: kind,
      place: { latitude: fix.latitude, longitude: fix.longitude },
    });
    await this.push
      .sendToUsers([userId], {
        title: '라무핀 안전 알림',
        body: `${zoneName} 근처예요. 주의해서 이동해 주세요.`,
        channel: 'danger',
        // 위험한 곳에 지금 있다는 알림이라 SOS 와 같이 다룹니다 (방해 금지 시간에도 보냅니다)
        category: 'sos',
        route: '/map',
        data: { kind: 'dangerZone', zoneName },
      })
      .catch((error: unknown) => this.logger.error(`위험지역 푸시 실패: ${String(error)}`));
  }
}
