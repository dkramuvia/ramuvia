import { Body, Controller, Get, HttpStatus, Inject, Module, NotFoundException, Put, Query, UseGuards } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { z } from 'zod';

import { AuthGuard, CurrentUser, type AuthUser } from '../auth/auth.guard.js';
import { appError, parseInput } from '../common/app-error.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { REDIS } from '../redis/redis.module.js';
import { USER_SUMMARY_COLUMNS, toUserSummary } from './user-summary.js';

const singleHouseholdBody = z.object({ enabled: z.boolean() });
const lookupQuery = z.object({ publicId: z.string().regex(/^\d{8}$/) });

/** 8자리 ID 를 차례로 넣어 가입자를 훑어보지 못하게 분당 조회 수 제한 */
const LOOKUP_PER_MINUTE = 20;

@Controller('me')
@UseGuards(AuthGuard)
class MeController {
  constructor(@Inject(MAIN_DB) private readonly db: MainDb) {}

  @Get()
  async me(@CurrentUser() user: AuthUser) {
    const row = await this.db
      .selectFrom('member.users')
      .select(['id', 'public_id', 'nickname', 'gender', 'birth_date', 'avatar_url', 'status_message', 'plan', 'single_household'])
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
    };
  }

  /** 내 등급 정책 + 관리자가 사용자별로 바꾼 값 (WBS 2.1, 11.6) */
  @Get('policy')
  async policy(@CurrentUser() user: AuthUser) {
    const row = await this.db
      .selectFrom('member.users as u')
      .innerJoin('config.plan_policies as p', 'p.plan', 'u.plan')
      .leftJoin('config.user_policy_overrides as o', 'o.user_id', 'u.id')
      .select(['u.plan', 'p.policy as base', 'o.policy as override'])
      .where('u.id', '=', user.id)
      .executeTakeFirst();
    if (!row) throw new NotFoundException();
    return { planId: row.plan, ...row.base, ...row.override };
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
  ) {}

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

    return { ...toUserSummary(row), relation: await this.relation(user.id, row.id) };
  }

  private async relation(me: string, other: string): Promise<'self' | 'friend' | 'request_sent' | 'request_received' | 'none'> {
    if (me === other) return 'self';
    const friend = await this.db
      .selectFrom('social.friendships')
      .select('user_id')
      .where('user_id', '=', me)
      .where('friend_id', '=', other)
      .executeTakeFirst();
    if (friend) return 'friend';
    const pending = await this.db
      .selectFrom('social.friend_requests')
      .select('from_user_id')
      .where('status', '=', 'pending')
      .where((eb) =>
        eb.or([
          eb.and([eb('from_user_id', '=', me), eb('to_user_id', '=', other)]),
          eb.and([eb('from_user_id', '=', other), eb('to_user_id', '=', me)]),
        ]),
      )
      .executeTakeFirst();
    if (!pending) return 'none';
    return pending.from_user_id === me ? 'request_sent' : 'request_received';
  }
}

@Module({ controllers: [MeController, UsersController] })
export class UsersModule {}
