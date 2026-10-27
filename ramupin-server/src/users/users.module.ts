import { Body, Controller, Delete, Get, HttpStatus, Inject, Module, NotFoundException, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { z } from 'zod';

import { AuthGuard, CurrentUser, type AuthUser } from '../auth/auth.guard.js';
import { appError, parseInput } from '../common/app-error.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { REDIS } from '../redis/redis.module.js';
import { relationBetween } from './relation.js';
import { USER_SUMMARY_COLUMNS, toUserSummary } from './user-summary.js';
import { resolvePolicy } from '../config/policy.js';
import { LocationModule } from '../location/location.module.js';
import { NICKNAME_MAX, ProfileService } from './profile.service.js';
import { MediaModule } from '../media/media.module.js';
import { makeAvatarPins, pinObjectKeys } from '../media/avatar-pin.js';
import { AVATAR_MAX_BYTES, StorageService } from '../media/storage.service.js';

const singleHouseholdBody = z.object({ enabled: z.boolean() });
const lookupQuery = z.object({ publicId: z.string().regex(/^\d{8}$/) });
const nicknameQuery = z.object({ nickname: z.string().min(1).max(NICKNAME_MAX) });
const profileBody = z.object({
  // 공백만 있는 이름, 아무 주소(javascript: 등)가 그대로 저장돼 친구에게 보였습니다 (10-12 자동 시험)
  nickname: z.string().trim().min(1).max(NICKNAME_MAX).optional(),
  // 기본 캐릭터는 앱이 그림으로 바꾸는 키("avatar:boy-01", 앱 avatars.ts), 사진은 /me/avatar/upload-target 으로
  // 올린 내 프로필 사진 주소만 받습니다 (update 에서 확인). 예전에는 폰 안 주소(file://)가 저장돼 친구에게 안 보였습니다
  avatarUrl: z.union([z.url({ protocol: /^https?$/ }).max(500), z.string().regex(/^avatar:[a-z0-9-]{1,40}$/)]).nullish(),
  gender: z.enum(['male', 'female']).nullish(),
  statusMessage: z.string().max(100).nullish(),
});
const avatarTargetBody = z.object({ contentType: z.string().min(3).max(100), bytes: z.number().int().positive().max(AVATAR_MAX_BYTES) });
// 앱이 보내는 +09:00 같은 시간대 표기도 받습니다 (/locations, 채팅과 같게, 10-12 자동 시험)
const hideModeBody = z.object({
  hideAll: z.boolean(),
  until: z.iso.datetime({ offset: true }).nullish(),
  /** 숨김 모드 종류 (WBS 12.7·12.8). 없으면 그대로 */
  scope: z.enum(['server_only', 'off_server']).optional(),
});
// 탈퇴 사유는 비워 둘 수 있습니다. 이유를 꼭 적게 하면 그냥 아무 글자나 넣습니다
const withdrawBody = z.object({ reason: z.string().max(500).default('') });

/** 8자리 ID 를 차례로 넣어 가입자를 훑어보지 못하게 분당 조회 수 제한 */
const LOOKUP_PER_MINUTE = 20;

@Controller('me')
@UseGuards(AuthGuard)
class MeController {
  constructor(
    @Inject(MAIN_DB) private readonly db: MainDb,
    private readonly profile: ProfileService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  async me(@CurrentUser() user: AuthUser) {
    const row = await this.db
      .selectFrom('member.users')
      .select(['id', 'public_id', 'nickname', 'gender', 'birth_date', 'avatar_url', 'status_message', 'plan', 'single_household', 'status'])
      .where('id', '=', user.id)
      .executeTakeFirst();
    if (!row) throw new NotFoundException();
    return {
      id: row.id,
      publicId: row.public_id,
      nickname: row.nickname,
      gender: row.gender,
      birthDate: row.birth_date,
      avatarUrl: row.avatar_url,
      statusMessage: row.status_message,
      plan: row.plan,
      singleHouseholdMode: row.single_household,
      // pending_guardian = 만 14세 미만, 보호자 동의 대기 (앱은 대기 화면만 보여 줌, 보완 4.1)
      accountStatus: row.status,
    };
  }

  /** 내 등급 정책 + 관리자가 사용자별로 바꾼 값 (WBS 2.1, 11.6) */
  @Get('policy')
  policy(@CurrentUser() user: AuthUser) {
    return resolvePolicy(this.db, user.id);
  }

  /** 프로필 수정 (WBS 3.9) */
  @Patch()
  async update(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = parseInput(profileBody, body);
    const before = await this.db.selectFrom('member.users').select('avatar_url').where('id', '=', user.id).executeTakeFirst();
    if (input.avatarUrl && !input.avatarUrl.startsWith('avatar:')) await this.assertOwnAvatar(user.id, input.avatarUrl);
    const result = await this.profile.update(user.id, input);
    // 사진을 바꿨으면 예전 사진과 그 핀 그림은 지웁니다. 지우지 못해도 프로필 저장은 끝난 뒤라 그대로 둡니다
    const oldKey = before?.avatar_url ? this.storage.avatarObjectKey(user.id, before.avatar_url) : null;
    if (oldKey && input.avatarUrl !== undefined && input.avatarUrl !== before?.avatar_url) {
      const pins = pinObjectKeys(oldKey);
      await Promise.all([oldKey, pins.normal, pins.active].map((key) => this.storage.remove(key).catch(() => undefined)));
    }
    return result;
  }

  /**
   * 프로필 사진 올릴 주소 (WBS 3.9). 앱은 여기로 직접 올린 뒤 받은 avatarUrl 을 PATCH /me 로 저장합니다.
   * 사진 형식(jpg·png)과 5MB 까지만 받습니다 — 지도 핀 그림을 만들 수 있는 형식만
   */
  @Post('avatar/upload-target')
  async avatarUploadTarget(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const { contentType } = parseInput(avatarTargetBody, body);
    const target = await this.storage.createAvatarUploadTarget(user.id, contentType);
    if (!target) throw appError(HttpStatus.BAD_REQUEST, 'UNSUPPORTED_TYPE', '사진 파일만 올릴 수 있습니다');
    return target;
  }

  /** 내 프로필 사진 폴더에 실제로 올라온 사진인지. 남의 주소·외부 주소·안 올린 주소는 거절합니다 */
  private async assertOwnAvatar(userId: string, avatarUrl: string) {
    const key = this.storage.avatarObjectKey(userId, avatarUrl);
    const uploaded = key ? await this.storage.verifyUpload(key) : null;
    if (!key || !uploaded || !uploaded.contentType.startsWith('image/') || uploaded.bytes > AVATAR_MAX_BYTES) {
      throw appError(HttpStatus.BAD_REQUEST, 'INVALID_AVATAR', '프로필 사진을 다시 올려 주세요');
    }
    // 지도 핀 그림 두 장을 사진 옆에 만들어 둡니다 (avatar-pin.ts). 앱은 주소 규칙으로 찾아 씁니다.
    // 읽을 수 없는 사진이면 핀이 없어 지도에 빈칸이 생기므로 저장 자체를 거절합니다
    try {
      const pins = await makeAvatarPins(await this.storage.readObject(key));
      const keys = pinObjectKeys(key);
      await this.storage.putObject(keys.normal, pins.normal, 'image/png');
      await this.storage.putObject(keys.active, pins.active, 'image/png');
    } catch {
      await this.storage.remove(key).catch(() => undefined);
      throw appError(HttpStatus.BAD_REQUEST, 'INVALID_AVATAR', '이 사진은 쓸 수 없어요. 다른 사진을 골라 주세요');
    }
  }

  /** 회원 탈퇴 (WBS 11.2: 전체 삭제, 복구 불가) */
  @Delete()
  withdraw(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const { reason } = parseInput(withdrawBody, body ?? {});
    return this.profile.withdraw(user.id, reason);
  }

  /** 숨김 모드 (WBS 9.5) */
  @Get('hide-mode')
  hideMode(@CurrentUser() user: AuthUser) {
    return this.profile.getHideMode(user.id);
  }

  @Put('hide-mode')
  setHideMode(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = parseInput(hideModeBody, body);
    return this.profile.setHideMode(user.id, { hideAll: input.hideAll, until: input.until ?? null, ...(input.scope ? { scope: input.scope } : {}) });
  }

  /** 1인 가구 모드 켜기/끄기 (첫 친구 수락 후 해제 안내에서 사용) */
  @Put('single-household')
  async setSingleHousehold(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const { enabled } = parseInput(singleHouseholdBody, body);
    await this.db.updateTable('member.users').set({ single_household: enabled, updated_at: new Date() }).where('id', '=', user.id).execute();
    return { singleHouseholdMode: enabled };
  }
}

@Controller('users')
@UseGuards(AuthGuard)
class UsersController {
  constructor(
    @Inject(MAIN_DB) private readonly db: MainDb,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly profile: ProfileService,
  ) {}

  /** 닉네임 중복 확인 (WBS 3.9) */
  @Get('nickname-availability')
  async nicknameAvailability(@CurrentUser() user: AuthUser, @Query() query: unknown) {
    const { nickname } = parseInput(nicknameQuery, query);
    return { available: await this.profile.isNicknameAvailable(user.id, nickname) };
  }

  /**
   * 8자리 ID(친구 추가 ID 입력·QR)로 사용자 찾기 → 사용자 요약 + 나와의 관계
   * TODO(보안): QR 은 서버 발급 일회용 토큰으로 교체
   */
  @Get('lookup')
  async lookup(@CurrentUser() user: AuthUser, @Query() query: unknown) {
    const { publicId } = parseInput(lookupQuery, query);

    const key = `ratelimit:user-lookup:${user.id}:${Math.floor(Date.now() / 60_000)}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 60);
    if (count > LOOKUP_PER_MINUTE) throw appError(HttpStatus.TOO_MANY_REQUESTS, 'LOOKUP_LIMIT', '잠시 후 다시 검색하세요');

    const row = await this.db
      .selectFrom('member.users')
      .select(USER_SUMMARY_COLUMNS)
      .where('public_id', '=', publicId)
      .where('status', '=', 'active')
      .executeTakeFirst();
    if (!row) throw appError(HttpStatus.NOT_FOUND, 'USER_NOT_FOUND', '사용자가 없습니다');

    return { ...toUserSummary(row), relation: await relationBetween(this.db, user.id, row.id) };
  }

}

@Module({
  // 탈퇴할 때 위치 DB 의 자료도 지워야 합니다 (다른 데이터베이스라 따라 지워지지 않습니다)
  // 프로필 사진은 사진 저장소에 올립니다 (MediaModule 의 StorageService)
  imports: [LocationModule, MediaModule],
  controllers: [MeController, UsersController],
  providers: [ProfileService],
  exports: [ProfileService],
})
export class UsersModule {}
