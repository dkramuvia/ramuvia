import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Injectable,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import { AuthGuard, CurrentUser, type AuthUser } from '../auth/auth.guard.js';
import { parseInput } from '../common/app-error.js';
import { FriendRequestsService } from './friend-requests.service.js';
import { QrTokenService } from './qr-token.service.js';
import { summaryWithRelation } from '../users/relation.js';
import { ShareSettingsService, shareSettingBody } from './share-settings.service.js';
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
  /** 언제부터 한자리에 있는지. 지도 마커의 "같은 자리에서 N분" (2026-09-28 디자인) */
  stayedSince?: string;
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
        'u.hide_all',
        'u.hide_until',
        'mine.location_level as my_level',
        'theirs.location_level as their_level',
        'theirs.show_status as their_show_status',
        'theirs.share_battery as their_share_battery',
      ])
      .where('f.user_id', '=', me)
      .where('u.status', '=', 'active')
      .orderBy('u.nickname')
      .execute();

    // 2) 위치 모듈에 "나에게 위치를 공개한 친구"의 현재 위치만 요청.
    //    숨김 모드를 켠 친구는 아예 묻지 않습니다 (WBS 9.5) — 안 묻는 것이 확실합니다
    const now = Date.now();
    const hiding = (r: { hide_all: boolean; hide_until: Date | null }) => r.hide_all && (!r.hide_until || r.hide_until.getTime() > now);
    const visibleIds = rows.filter((r) => r.their_level && r.their_level !== 'hidden' && !hiding(r)).map((r) => r.id);
    const current = await this.location.getCurrent(visibleIds);
    // 마커에 "같은 자리에서 1시간 40분" 을 띄우려면 언제부터 거기 있었는지가 필요합니다
    const stayedSince = await this.location.getStayedSince([...current.keys()]);
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
        // 상태 공개를 끈 친구는 머문 시간도 보이지 않아야 합니다 (그 자체가 상태입니다)
        const since = r.their_show_status ? stayedSince.get(r.id) : undefined;
        if (since) friend.stayedSince = since.toISOString();
      }
      return friend;
    });
  }
}

// 상대를 가리키는 방법은 둘 중 하나입니다: 8자리 ID 로 찾은 사용자 ID, 또는 QR 토큰
const sendRequestBody = z
  .object({
    userId: z.uuid().optional(),
    /** QR 로 추가할 때. 요청이 만들어지면 그 토큰은 바로 버립니다 (일회용) */
    qrToken: z.string().min(10).max(100).optional(),
    message: z.string().max(100).nullish(),
  })
  .refine((v) => !!v.userId || !!v.qrToken, { message: 'userId 또는 qrToken 이 필요합니다' });
const qrQuery = z.object({ token: z.string().min(10).max(100) });

@Controller('friends')
@UseGuards(AuthGuard)
class FriendsController {
  constructor(
    @Inject(MAIN_DB) private readonly db: MainDb,
    private readonly friends: FriendsService,
    private readonly requests: FriendRequestsService,
    private readonly qr: QrTokenService,
    private readonly shareSettings: ShareSettingsService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.friends.list(user.id);
  }

  @Get('requests')
  listRequests(@CurrentUser() user: AuthUser) {
    return this.requests.listPending(user.id);
  }

  @Get('requests/:requestId')
  getRequest(@CurrentUser() user: AuthUser, @Param('requestId', ParseUUIDPipe) requestId: string) {
    return this.requests.get(user.id, requestId);
  }

  /** 친구 요청 보내기 → { requestId, status: 'pending' | 'accepted' } (상대가 먼저 요청했으면 바로 친구) */
  @Post('requests')
  async sendRequest(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const { userId, qrToken, message } = parseInput(sendRequestBody, body);
    const targetId = qrToken ? await this.qr.resolve(qrToken) : userId!;
    const result = await this.requests.send(user.id, targetId, message);
    // 요청이 만들어진 뒤에 버립니다. 거절당하는 요청에 토큰을 써 버리면 다시 보여 달라고 해야 합니다
    if (qrToken) await this.qr.consume(qrToken);
    return result;
  }

  /** 내 QR 에 넣을 일회용 토큰 (WBS 3.6) */
  @Post('qr-token')
  @HttpCode(HttpStatus.OK)
  issueQr(@CurrentUser() user: AuthUser) {
    return this.qr.issue(user.id);
  }

  /** QR 토큰으로 상대 찾기. 읽는 것만으로는 토큰을 버리지 않습니다 */
  @Get('by-qr')
  async byQr(@CurrentUser() user: AuthUser, @Query() query: unknown) {
    const { token } = parseInput(qrQuery, query);
    return summaryWithRelation(this.db, user.id, await this.qr.resolve(token));
  }

  @Post('requests/:requestId/accept')
  @HttpCode(HttpStatus.OK)
  accept(@CurrentUser() user: AuthUser, @Param('requestId', ParseUUIDPipe) requestId: string) {
    return this.requests.accept(user.id, requestId);
  }

  @Post('requests/:requestId/reject')
  @HttpCode(HttpStatus.OK)
  async reject(@CurrentUser() user: AuthUser, @Param('requestId', ParseUUIDPipe) requestId: string) {
    await this.requests.reject(user.id, requestId);
    return { singleHouseholdReleasable: false };
  }

  @Delete('requests/:requestId')
  @HttpCode(HttpStatus.NO_CONTENT)
  cancel(@CurrentUser() user: AuthUser, @Param('requestId', ParseUUIDPipe) requestId: string) {
    return this.requests.cancel(user.id, requestId);
  }

  @Get(':friendId/share-setting')
  getShareSetting(@CurrentUser() user: AuthUser, @Param('friendId', ParseUUIDPipe) friendId: string) {
    return this.shareSettings.get(user.id, friendId);
  }

  @Put(':friendId/share-setting')
  saveShareSetting(@CurrentUser() user: AuthUser, @Param('friendId', ParseUUIDPipe) friendId: string, @Body() body: unknown) {
    return this.shareSettings.save(user.id, friendId, parseInput(shareSettingBody, body));
  }
}

@Module({
  imports: [LocationModule],
  controllers: [FriendsController],
  providers: [FriendsService, FriendRequestsService, ShareSettingsService, QrTokenService],
})
export class FriendsModule {}
