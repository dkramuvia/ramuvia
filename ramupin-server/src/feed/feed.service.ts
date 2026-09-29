import { Inject, Injectable } from '@nestjs/common';

import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { LocationService } from '../location/location.service.js';

/**
 * 지도 메인 바텀시트의 활동 기록 (WBS 9.7).
 *
 * **새 표를 만들지 않습니다.** 이미 남기고 있는 기록에서 뽑아 씁니다.
 *   - 친구가 안심장소를 드나든 기록 (`member.safe_zone_events`)
 *   - 누가 내 위치를 본 기록 (`location.location_access_logs`)
 *   - 친구가 한자리에 오래 머무는 중 (`location.user_status.fixed_since`)
 *
 * 왜 이렇게 하나: 피드를 위해 따로 줄을 쌓으면 **같은 사실이 두 곳에 남습니다.**
 * 위치가 들어올 때마다 쓰기가 늘고, 둘이 어긋나면 어느 쪽이 맞는지 알 수 없습니다.
 * 읽을 때 모으는 편이 훨씬 쌉니다 — 피드는 지도를 열 때만 읽습니다.
 */

export type FeedItemType = 'stay' | 'nearby' | 'checkedLocation' | 'arrived' | 'left' | 'sharedLocation';

export interface FeedItem {
  id: string;
  type: FeedItemType;
  message: string;
  createdAt: string;
}

/** 이 기간 안의 일만 보여 줍니다. 오래된 소식은 피드에 쓸모가 없습니다 */
const WINDOW_HOURS = 24;
/** 화면이 바텀시트라 많이 줘도 안 봅니다 */
const LIMIT = 30;
/** 이보다 오래 한자리에 있어야 "머무는 중" 으로 칩니다 */
const STAY_MIN_MINUTES = 60;

/** 90분 → "1시간 30분" (앱 문구와 같은 방식) */
function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

@Injectable()
export class FeedService {
  constructor(
    @Inject(MAIN_DB) private readonly db: MainDb,
    private readonly location: LocationService,
  ) {}

  async list(userId: string, now = new Date()): Promise<FeedItem[]> {
    const since = new Date(now.getTime() - WINDOW_HOURS * 60 * 60_000);
    const [zones, viewers, stays] = await Promise.all([
      this.zoneEvents(userId, since),
      this.whoCheckedMe(userId, since),
      this.friendsStaying(userId, now),
    ]);
    return [...zones, ...viewers, ...stays]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, LIMIT);
  }

  /** 내가 알림 대상으로 지정된 안심장소를 친구가 드나든 기록 */
  private async zoneEvents(userId: string, since: Date): Promise<FeedItem[]> {
    const rows = await this.db
      .selectFrom('member.safe_zone_events as e')
      .innerJoin('member.safe_zones as z', 'z.id', 'e.zone_id')
      .innerJoin('member.safe_zone_recipients as r', 'r.zone_id', 'z.id')
      .innerJoin('member.users as u', 'u.id', 'e.user_id')
      .select(['e.id', 'e.kind', 'e.occurred_at', 'z.name as zone_name', 'u.nickname'])
      .where('r.friend_id', '=', userId)
      .where('e.occurred_at', '>=', since)
      .orderBy('e.occurred_at', 'desc')
      .limit(LIMIT)
      .execute();

    return rows.map((r) => ({
      id: `zone:${r.id}`,
      type: r.kind === 'enter' ? ('arrived' as const) : ('left' as const),
      message: r.kind === 'enter' ? `${r.nickname}님이 ${r.zone_name}에 도착했습니다.` : `${r.nickname}님이 ${r.zone_name}에서 나갔습니다.`,
      createdAt: r.occurred_at.toISOString(),
    }));
  }

  /**
   * 누가 내 위치를 봤는지.
   *
   * 위치정보법상 남기게 되어 있는 기록을 그대로 보여 줍니다 — 내 위치를 누가 봤는지
   * 본인이 알 수 있어야 합니다.
   */
  private async whoCheckedMe(userId: string, since: Date): Promise<FeedItem[]> {
    const logs = await this.location.recentViewers(userId, since, LIMIT);
    if (logs.length === 0) return [];

    const names = await this.db
      .selectFrom('member.users')
      .select(['id', 'nickname'])
      .where(
        'id',
        'in',
        logs.map((l) => l.viewerUserId),
      )
      .execute();
    const nameOf = new Map(names.map((n) => [n.id, n.nickname]));

    return logs
      .filter((l) => nameOf.has(l.viewerUserId))
      .map((l) => ({
        id: `view:${l.id}`,
        type: 'checkedLocation' as const,
        message: `${nameOf.get(l.viewerUserId)}님이 내 위치를 확인했습니다.`,
        createdAt: l.accessedAt.toISOString(),
      }));
  }

  /** 한자리에 오래 있는 친구 (지금 상태라 시각은 머물기 시작한 때로 둡니다) */
  private async friendsStaying(userId: string, now: Date): Promise<FeedItem[]> {
    const friends = await this.db
      .selectFrom('social.friendships as f')
      .innerJoin('member.users as u', 'u.id', 'f.friend_id')
      .select(['u.id', 'u.nickname'])
      .where('f.user_id', '=', userId)
      // 숨김 모드인 친구는 빼야 합니다 — 숨는 동안 "어디에 오래 있다" 가 보이면 숨긴 뜻이 없습니다
      .where('u.hide_all', '=', false)
      .where((eb) => eb.or([eb('u.hide_until', 'is', null), eb('u.hide_until', '<=', now)]))
      .execute();
    if (friends.length === 0) return [];

    const stayed = await this.location.getStayedSince(friends.map((f) => f.id));
    return friends
      .map((f) => ({ friend: f, since: stayed.get(f.id) }))
      .filter((row): row is { friend: (typeof friends)[number]; since: Date } => {
        if (!row.since) return false;
        return now.getTime() - row.since.getTime() >= STAY_MIN_MINUTES * 60_000;
      })
      .map(({ friend, since }) => ({
        // 같은 머무름이 계속 같은 항목으로 보이도록 시작 시각을 id 에 넣습니다
        id: `stay:${friend.id}:${since.getTime()}`,
        type: 'stay' as const,
        message: `${friend.nickname}님이 한자리에서 ${duration(Math.floor((now.getTime() - since.getTime()) / 60_000))}째 머무르고 있습니다.`,
        createdAt: since.toISOString(),
      }));
  }
}
