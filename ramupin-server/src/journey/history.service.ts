import { Inject, Injectable } from '@nestjs/common';

import { MAIN_DB, type MainDb } from '../database/main-database.module.js';

/**
 * 알림 내역 — 서버가 가진 부분 (WBS 9.7).
 *
 * 앱은 받은 알림을 **기기에도** 남깁니다. 그래서 인터넷이 없어도 지난 알림을 볼 수 있습니다.
 * 여기서 주는 것은 기기에 없는 것(앱을 지웠다 깔거나, 폰을 바꾸거나, 알림을 놓친 경우)을
 * 채우기 위한 것입니다. 앱이 두 목록을 id 로 합칩니다.
 *
 * **내가 받은 것만** 줍니다. 친구의 이상징후라도 나에게 알림이 가지 않았으면 여기 없습니다.
 */

export type HistoryCategory = 'safety' | 'place';

export interface HistoryEvent {
  id: string;
  type: string;
  category: HistoryCategory;
  message: string;
  createdAt: string;
}

/** 한 번에 주는 최대 건수. 기기에 남은 것과 합치므로 넉넉하면 됩니다 */
const LIMIT = 100;

@Injectable()
export class HistoryService {
  constructor(@Inject(MAIN_DB) private readonly db: MainDb) {}

  async list(viewerId: string, category?: HistoryCategory): Promise<HistoryEvent[]> {
    const [sos, zones, anomalies] = await Promise.all([
      category === 'place' ? [] : this.sosReceived(viewerId),
      category === 'safety' ? [] : this.zoneEvents(viewerId),
      category === 'place' ? [] : this.anomalies(viewerId),
    ]);
    return [...sos, ...zones, ...anomalies].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, LIMIT);
  }

  /** 내가 받은 SOS */
  private async sosReceived(viewerId: string): Promise<HistoryEvent[]> {
    const rows = await this.db
      .selectFrom('member.sos_deliveries as d')
      .innerJoin('member.sos_events as e', 'e.id', 'd.sos_id')
      .innerJoin('member.users as u', 'u.id', 'e.user_id')
      .select(['e.id', 'u.nickname', 'e.status', 'e.created_at'])
      .where('d.recipient_user_id', '=', viewerId)
      .orderBy('e.created_at', 'desc')
      .limit(LIMIT)
      .execute();
    return rows.map((r) => ({
      id: `sos-${r.id}`,
      type: 'sos',
      category: 'safety' as const,
      message: r.status === 'cancelled' ? `${r.nickname}님이 SOS를 취소했어요` : `${r.nickname}님이 SOS를 보냈어요`,
      createdAt: r.created_at.toISOString(),
    }));
  }

  /** 내가 알림 대상으로 지정된 안심장소의 진입·이탈 */
  private async zoneEvents(viewerId: string): Promise<HistoryEvent[]> {
    const rows = await this.db
      .selectFrom('member.safe_zone_events as e')
      .innerJoin('member.safe_zones as z', 'z.id', 'e.zone_id')
      .innerJoin('member.safe_zone_recipients as r', 'r.zone_id', 'z.id')
      .innerJoin('member.users as u', 'u.id', 'e.user_id')
      .select(['e.id', 'e.kind', 'e.occurred_at', 'z.name', 'u.nickname'])
      .where('r.friend_id', '=', viewerId)
      .orderBy('e.occurred_at', 'desc')
      .limit(LIMIT)
      .execute();
    return rows.map((r) => ({
      id: `zone-${r.id}`,
      type: r.kind === 'enter' ? 'geofenceArrive' : 'geofenceLeave',
      category: 'place' as const,
      message: r.kind === 'enter' ? `${r.nickname}님이 ${r.name}에 도착했어요` : `${r.nickname}님이 ${r.name}에서 나갔어요`,
      createdAt: r.occurred_at.toISOString(),
    }));
  }

  /**
   * 내 친구들의 이상징후.
   *
   * 이상징후는 "나를 친구로 등록한 사람들" 에게 갑니다 (anomaly.service.ts friendIds).
   * 그러니 내가 받은 것은 **내가 친구로 등록한 사람들** 의 이상징후입니다.
   * 회사(모니터링)만 받은 건(target='monitoring')은 제외합니다 — 나에게는 가지 않았습니다.
   */
  private async anomalies(viewerId: string): Promise<HistoryEvent[]> {
    const rows = await this.db
      .selectFrom('member.anomaly_events as a')
      .innerJoin('social.friendships as f', 'f.friend_id', 'a.user_id')
      .innerJoin('member.users as u', 'u.id', 'a.user_id')
      .select(['a.id', 'a.track', 'a.stage', 'a.detected_at', 'u.nickname'])
      .where('f.user_id', '=', viewerId)
      .where('a.target', '=', 'friends')
      .orderBy('a.detected_at', 'desc')
      .limit(LIMIT)
      .execute();
    return rows.map((r) => ({
      id: `anomaly-${r.id}`,
      type: TYPE_BY_TRACK[r.track] ?? 'noMovement',
      category: 'safety' as const,
      message: anomalyMessage(r.nickname, r.track, r.stage),
      createdAt: r.detected_at.toISOString(),
    }));
  }
}

/** 이상징후 갈래 → 앱의 알림 종류 (src/types/models.ts HistoryEventType) */
const TYPE_BY_TRACK: Record<string, string> = {
  battery: 'batteryLow',
  no_signal: 'gpsLost',
  gps_fixed: 'noMovement',
  fixed_battery_zero: 'noMovement',
  fixed_charging: 'noMovement',
};

function anomalyMessage(nickname: string, track: string, stage: string): string {
  switch (track) {
    case 'battery':
      return stage === 'zero' ? `${nickname}님의 전화기 배터리가 다 떨어졌어요` : `${nickname}님의 배터리가 얼마 남지 않았어요`;
    case 'no_signal':
      return `${nickname}님의 위치가 ${stage} 동안 확인되지 않아요`;
    default:
      return `${nickname}님이 ${stage} 동안 같은 자리에 계세요`;
  }
}
