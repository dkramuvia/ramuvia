import { Controller, Get, Inject, Module, NotFoundException, UseGuards } from '@nestjs/common';

import { AuthGuard, CurrentUser, type AuthUser } from '../auth/auth.guard.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';

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
    return { planId: row.plan, ...row.base, ...(row.override ?? {}) };
  }
}

@Module({ controllers: [MeController] })
export class UsersModule {}
