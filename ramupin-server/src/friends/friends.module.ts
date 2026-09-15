import { Controller, Get, Inject, Injectable, Module, UseGuards } from '@nestjs/common';

import { AuthGuard, CurrentUser, type AuthUser } from '../auth/auth.guard.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import type { ShareLevel } from '../database/main.schema.js';
import { LocationModule } from '../location/location.module.js';
import { LocationService, type CurrentLocation } from '../location/location.service.js';

/** 앱 src/types/models.ts 의 Friend 와 같은 모양 */
interface FriendResponse {
  id: string;
  publicId: string;
  nickname: string;
  avatarUrl: string | null;
  /** 내가 이 친구에게 공유하는 수준 */
  myShareLevel: ShareLevel;
  isOnline: boolean;
  batteryLevel?: number;
  speedKmh?: number;
  location?: { latitude: number; longitude: number; updatedAt: string };
}

// 흐림 위치: 소수점 둘째 자리(약 1km)로 반올림 — TODO(정책): 흐림 반경을 정책값으로
const blur = (v: number) => Math.round(v * 100) / 100;
const ONLINE_WINDOW_MS = 5 * 60_000;

@Injectable()
class FriendsService {
  constructor(
    @Inject(MAIN_DB) private readonly db: MainDb,
    private readonly location: LocationService,
  ) {}

  async list(me: string): Promise<FriendResponse[]> {
    // 1) 본 DB: 친구 목록 + 양방향 공유 설정 (위치 DB 와 JOIN 하지 않음)
    const rows = await this.db
      .selectFrom('social.friendships as f')
      .innerJoin('member.users as u', 'u.id', 'f.friend_id')
      .leftJoin('social.friend_share_settings as mine', (join) =>
        join.onRef('mine.owner_id', '=', 'f.user_id').onRef('mine.friend_id', '=', 'f.friend_id'),
      )
      .leftJoin('social.friend_share_settings as theirs', (join) =>
        join.onRef('theirs.owner_id', '=', 'f.friend_id').onRef('theirs.friend_id', '=', 'f.user_id'),
      )
      .select([
        'u.id',
        'u.public_id',
        'u.nickname',
        'u.avatar_url',
        'mine.location_level as my_level',
        'theirs.location_level as their_level',
        'theirs.show_status as their_show_status',
        'theirs.share_battery as their_share_battery',
      ])
      .where('f.user_id', '=', me)
      .where('u.status', '=', 'active')
      .orderBy('u.nickname')
      .execute();

    // 2) 위치 모듈에 "나에게 위치를 공개한 친구"의 현재 위치만 요청
    const visibleIds = rows.filter((r) => r.their_level && r.their_level !== 'hidden').map((r) => r.id);
    const current = await this.location.getCurrent(visibleIds);
    await this.location.logAccess([...current.keys()], me, 'friend_list');

    // 3) 앱에서 합치기
    return rows.map((r) => {
      const loc: CurrentLocation | undefined = current.get(r.id);
      const theirLevel = (r.their_level ?? 'hidden') as ShareLevel;
      const friend: FriendResponse = {
        id: r.id,
        publicId: r.public_id,
        nickname: r.nickname,
        avatarUrl: r.avatar_url,
        myShareLevel: (r.my_level ?? 'hidden') as ShareLevel,
        isOnline: !!(r.their_show_status && loc && Date.now() - new Date(loc.measuredAt).getTime() < ONLINE_WINDOW_MS),
      };
      if (loc) {
        const exact = theirLevel === 'exact';
        friend.location = {
          latitude: exact ? loc.latitude : blur(loc.latitude),
          longitude: exact ? loc.longitude : blur(loc.longitude),
          updatedAt: loc.measuredAt,
        };
        if (exact && loc.speed != null) friend.speedKmh = Math.round(loc.speed * 3.6);
        if (r.their_share_battery && loc.battery != null) friend.batteryLevel = loc.battery;
      }
      return friend;
    });
  }
}

@Controller('friends')
@UseGuards(AuthGuard)
class FriendsController {
  constructor(private readonly friends: FriendsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.friends.list(user.id);
  }
}

@Module({
  imports: [LocationModule],
  controllers: [FriendsController],
  providers: [FriendsService],
})
export class FriendsModule {}
