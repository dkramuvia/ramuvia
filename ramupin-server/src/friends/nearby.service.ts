import { Inject, Injectable, Logger } from '@nestjs/common';

import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { LocationService } from '../location/location.service.js';

/**
 * 근처 친구 찾기 (WBS 12.9).
 *
 * **아직 친구가 아닌 사람**에게 "이 근처에 있다" 를 알려 주는 기능이라 조심해서 다룹니다.
 *
 * 지키는 것
 *   1. **켠 사람만 나옵니다.** 위치정보법상 본인 동의 없이 남에게 위치를 알릴 수 없습니다.
 *      `nearby_discoverable` 기본값은 꺼짐이고, 나도 켜야 남이 보입니다 (서로 동의)
 *   2. **좌표는 주지 않습니다.** 근처에 있다는 사실과 지역명까지만
 *   3. 숨김 모드인 사람은 빠집니다
 *   4. 오래된 위치는 빠집니다 — 세 시간 전에 여기 있었다는 것은 "근처"가 아닙니다
 */

/** 이 반경 안을 근처로 봅니다 (피그마 "내 반경 1km") */
export const NEARBY_RADIUS_M = 1000;

/** 이보다 오래된 위치는 쓰지 않습니다 */
export const FRESH_MINUTES = 30;

/** 한 번에 돌려주는 최대 인원. 화면이 목록이라 많이 줘도 쓸모가 없습니다 */
const LIMIT = 20;

export interface NearbySuggestion {
  user: { id: string; publicId: string; nickname: string; avatarUrl: string | null; areaName: string | null };
  /** 이미 친구 요청을 보냈는지 */
  requested: boolean;
  /** 근처에서 발견한 시각 (상대의 마지막 위치 시각) */
  foundAt: string;
}

/**
 * 두 좌표 사이 거리(m).
 *
 * 1km 안을 보는 데는 이 정도 근사로 충분합니다. 경도 1도의 실제 길이는 위도에 따라
 * 줄어들기 때문에(적도에서 111km, 서울에서 약 88km) `cos(위도)` 를 곱합니다.
 * 이걸 빠뜨리면 동서 방향 거리가 서울에서 **1.25배로** 나와, 1km 로 잡아도 800m 만 걸립니다.
 */
export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const latM = (bLat - aLat) * 111_320;
  const lngM = (bLng - aLng) * 111_320 * Math.cos(((aLat + bLat) / 2) * (Math.PI / 180));
  return Math.hypot(latM, lngM);
}

@Injectable()
export class NearbyService {
  private readonly logger = new Logger(NearbyService.name);

  constructor(
    @Inject(MAIN_DB) private readonly db: MainDb,
    private readonly location: LocationService,
  ) {}

  /** 내 근처 찾기 켜짐 여부 */
  async getDiscoverable(userId: string): Promise<{ discoverable: boolean }> {
    const row = await this.db
      .selectFrom('member.users')
      .select('nearby_discoverable')
      .where('id', '=', userId)
      .executeTakeFirst();
    return { discoverable: row?.nearby_discoverable ?? false };
  }

  async setDiscoverable(userId: string, discoverable: boolean): Promise<{ discoverable: boolean }> {
    await this.db
      .updateTable('member.users')
      .set({ nearby_discoverable: discoverable, updated_at: new Date() })
      .where('id', '=', userId)
      .execute();
    return { discoverable };
  }

  /**
   * 내 근처에 있는 사람들.
   *
   * **내가 꺼 두었으면 빈 목록입니다.** 내 위치는 숨기면서 남만 보는 것은 공평하지 않고,
   * 그런 쓰임이 쌓이면 위치를 켜 둘 이유가 없어집니다.
   */
  async list(userId: string, now = new Date()): Promise<NearbySuggestion[]> {
    const me = await this.db
      .selectFrom('member.users')
      .select(['nearby_discoverable', 'hide_all', 'hide_until'])
      .where('id', '=', userId)
      .executeTakeFirst();
    if (!me?.nearby_discoverable) return [];
    // 숨김 모드일 때는 나도 찾지 않습니다 (숨는 동안은 서로 안 보이는 것이 일관됩니다)
    if (me.hide_all || (me.hide_until && me.hide_until > now)) return [];

    const mine = (await this.location.getCurrent([userId])).get(userId);
    if (!mine) return [];

    // 켜 둔 사람 중에서, 나와 친구가 아니고 차단하지 않은 사람
    const candidates = await this.db
      .selectFrom('member.users as u')
      .select(['u.id', 'u.public_id', 'u.nickname', 'u.avatar_url'])
      .where('u.nearby_discoverable', '=', true)
      .where('u.status', '=', 'active')
      .where('u.id', '!=', userId)
      .where('u.hide_all', '=', false)
      .where((eb) => eb.or([eb('u.hide_until', 'is', null), eb('u.hide_until', '<=', now)]))
      .where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom('social.friendships as f')
              .select('f.friend_id')
              .whereRef('f.friend_id', '=', 'u.id')
              .where('f.user_id', '=', userId),
          ),
        ),
      )
      .execute();
    if (candidates.length === 0) return [];

    const positions = await this.location.getCurrent(candidates.map((c) => c.id));
    const freshAfter = now.getTime() - FRESH_MINUTES * 60_000;

    const near = candidates
      .map((c) => ({ candidate: c, position: positions.get(c.id) }))
      .filter((row): row is { candidate: (typeof candidates)[number]; position: NonNullable<typeof row.position> } => {
        if (!row.position) return false;
        // 오래된 위치는 "근처" 가 아닙니다
        if (new Date(row.position.measuredAt).getTime() < freshAfter) return false;
        return distanceM(mine.latitude, mine.longitude, row.position.latitude, row.position.longitude) <= NEARBY_RADIUS_M;
      })
      .slice(0, LIMIT);
    if (near.length === 0) return [];

    // 이미 보낸 친구 요청은 버튼을 바꿔 줘야 합니다
    const requested = await this.db
      .selectFrom('social.friend_requests')
      .select('to_user_id')
      .where('from_user_id', '=', userId)
      .where(
        'to_user_id',
        'in',
        near.map((n) => n.candidate.id),
      )
      .where('status', '=', 'pending')
      .execute();
    const requestedIds = new Set(requested.map((r) => r.to_user_id));

    // 위치를 본 기록 (위치정보법: 이용·제공 사실 확인자료)
    await this.location
      .logAccess(
        near.map((n) => n.candidate.id),
        userId,
        'nearby',
      )
      .catch((error: unknown) => this.logger.error(`근처 찾기 기록 실패: ${String(error)}`));

    return near.map(({ candidate, position }) => ({
      user: {
        id: candidate.id,
        publicId: candidate.public_id,
        nickname: candidate.nickname,
        avatarUrl: candidate.avatar_url,
        // 좌표는 주지 않습니다. 지역명도 아직 서버가 만들지 않아 비워 둡니다
        areaName: null,
      },
      requested: requestedIds.has(candidate.id),
      foundAt: new Date(position.measuredAt).toISOString(),
    }));
  }
}
