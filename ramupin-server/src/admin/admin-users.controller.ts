import { Body, Controller, Get, Inject, NotFoundException, Param, Put, Query, UseGuards } from '@nestjs/common';
import { sql } from 'kysely';
import { z } from 'zod';

import { appError, parseInput } from '../common/app-error.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { hashPhone, normalizePhone } from '../common/phone.js';
import { PhoneService } from '../phone/phone.module.js';
import { AdminGuard, CurrentAdmin, assertCanEdit, type AdminUser } from './admin.guard.js';

/**
 * 관리자 관제센터 02·03 사용자별 설정 (피그마 `관리자` 02 검색 · 03 사용자 선택, 2026-10-15).
 *
 * 02: 아이디 · 이름 · 전화번호로 찾아 목록으로 봅니다. 비워 두고 찾으면 전체 목록입니다.
 * 03: 한 명을 골라 계정 정보(국가 · 등급 · 만료일)를 바꿉니다. 개별 옵션(정책 예외)은 admin.module.ts 의
 *     PUT/DELETE users/:publicId 가 그대로 맡습니다.
 *
 * **피그마와 다른 점**
 * - 아이디는 앱의 8자리 ID 입니다 (앱에 로그인 아이디가 따로 없음).
 * - 이름은 따로 받지 않아 **닉네임**을 씁니다 (대표님 10-15).
 * - 이메일은 저장하지 않아 '-' 입니다. 검색 기준에서도 뺐습니다.
 * - 전화번호는 목록에서는 가려서(010-****-5678), 한 명을 골랐을 때만 원문을 보여 줍니다.
 *   원문을 꺼낼 때마다 member.phone_access_logs 에 관리자 아이디가 남습니다 (개인정보).
 */

const PAGE_SIZE = 50;
/** 만료일이 이만큼 안으로 다가오면 '만료 임박' */
const EXPIRING_DAYS = 7;
/** 이만큼 앱을 안 쓰면 '휴면' */
const DORMANT_DAYS = 365;

const PLANS = ['basic', 'platinum', 'trinity', 'care', 'guardian'] as const;

const searchQuery = z.object({
  field: z.enum(['publicId', 'name', 'phone']).default('publicId'),
  q: z.string().trim().max(50).default(''),
  page: z.coerce.number().int().min(0).max(10_000).default(0),
});
const publicIdParam = z.string().regex(/^\d{8}$/, '8자리 사용자 ID');
const accountBody = z
  .object({
    country: z.string().regex(/^[A-Z]{2}$/, '국가 코드는 대문자 두 글자입니다').optional(),
    plan: z.enum(PLANS).optional(),
    // 'YYYY-MM-DD'. null 이면 만료 없음
    planExpiresAt: z.iso.date().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: '바꿀 항목이 없습니다' });

type UserStatus = 'normal' | 'expiring' | 'dormant' | 'suspended' | 'withdrawn';

function statusOf(row: { status: string; plan_expires_at: Date | null; last_active_at: Date | null }, now = Date.now()): UserStatus {
  if (row.status === 'withdrawn') return 'withdrawn';
  if (row.status === 'suspended') return 'suspended';
  if (row.plan_expires_at && row.plan_expires_at.getTime() - now < EXPIRING_DAYS * 86_400_000) return 'expiring';
  if (row.last_active_at && now - row.last_active_at.getTime() > DORMANT_DAYS * 86_400_000) return 'dormant';
  return 'normal';
}

const day = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

@Controller('admin/api/users')
@UseGuards(AdminGuard)
export class AdminUsersController {
  constructor(
    @Inject(MAIN_DB) private readonly db: MainDb,
    private readonly phones: PhoneService,
  ) {}

  /** 02 검색. 부분 일치 · 대소문자 무시 (전화번호는 원문을 저장하지 않아 번호 전체가 같아야 찾습니다) */
  @Get()
  async search(@CurrentAdmin() admin: AdminUser, @Query() query: unknown) {
    const { field, q, page } = parseInput(searchQuery, query);
    let builder = this.db
      .selectFrom('member.users as u')
      .leftJoin('member.user_phones as p', 'p.user_id', 'u.id')
      .select([
        'u.id',
        'u.public_id',
        'u.nickname',
        'u.country',
        'u.plan',
        'u.status',
        'u.plan_expires_at',
        'u.last_active_at',
        'u.created_at',
        sql<boolean>`p.user_id IS NOT NULL`.as('has_phone'),
      ]);
    if (q) {
      const like = `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
      if (field === 'publicId') builder = builder.where('u.public_id', 'like', like);
      else if (field === 'name') builder = builder.where('u.nickname', 'ilike', like);
      else {
        const digits = normalizePhone(q);
        if (digits.length < 9) throw appError(400, 'PHONE_TOO_SHORT', '전화번호는 전체를 입력하세요 (예: 010-1234-5678)');
        builder = builder.where('p.phone_hash', '=', hashPhone(digits));
      }
    }

    const [rows, total] = await Promise.all([
      builder
        .orderBy('u.created_at', 'desc')
        .limit(PAGE_SIZE)
        .offset(page * PAGE_SIZE)
        .execute(),
      builder
        .clearSelect()
        .select((eb) => eb.fn.countAll<string>().as('count'))
        .executeTakeFirstOrThrow(),
    ]);

    const actor = `admin:${admin.loginId}`;
    const users = await Promise.all(
      rows.map(async (r) => ({
        publicId: r.public_id,
        name: r.nickname,
        phone: r.has_phone ? await this.phones.getMasked(r.id, actor) : null,
        email: null,
        country: r.country,
        plan: r.plan,
        status: statusOf(r),
        createdAt: r.created_at,
      })),
    );
    return { total: Number(total.count), page, pageSize: PAGE_SIZE, users };
  }

  /** 03 선택한 사용자 한 명. 전화번호 원문이 들어가므로 조회 이력이 남습니다 */
  @Get(':publicId')
  async detail(@CurrentAdmin() admin: AdminUser, @Param('publicId') publicIdRaw: string) {
    const publicId = parseInput(publicIdParam, publicIdRaw);
    const row = await this.db
      .selectFrom('member.users as u')
      .leftJoin('config.user_policy_overrides as o', 'o.user_id', 'u.id')
      .leftJoin('member.user_phones as p', 'p.user_id', 'u.id')
      .select([
        'u.id',
        'u.public_id',
        'u.nickname',
        'u.country',
        'u.plan',
        'u.status',
        'u.plan_expires_at',
        'u.last_active_at',
        'u.created_at',
        'o.policy as override',
        'p.verified_at as phone_verified_at',
      ])
      .where('u.public_id', '=', publicId)
      .executeTakeFirst();
    if (!row) throw new NotFoundException('없는 사용자입니다');

    const providers = await this.db
      .selectFrom('member.social_accounts')
      .select('provider')
      .where('user_id', '=', row.id)
      .orderBy('created_at')
      .execute();
    const phone = row.phone_verified_at ? await this.phones.getForSend(row.id, 'admin', `admin:${admin.loginId}`) : null;

    return {
      publicId: row.public_id,
      name: row.nickname,
      phone,
      email: null,
      country: row.country,
      plan: row.plan,
      status: statusOf(row),
      createdAt: day(row.created_at),
      planExpiresAt: day(row.plan_expires_at),
      lastActiveAt: row.last_active_at,
      providers: providers.map((p) => p.provider),
      phoneVerified: !!row.phone_verified_at,
      override: row.override ?? null,
    };
  }

  /**
   * 03 계정 정보 저장 (국가 · 등급 · 만료일). 보낸 항목만 바뀝니다.
   * **등급을 바꾸면 개별 설정(예외)을 지웁니다** — 피그마 03 "등급을 바꾸면 개별 설정값이 새 등급의 기본값으로 초기화".
   */
  @Put(':publicId/account')
  async updateAccount(@CurrentAdmin() admin: AdminUser, @Param('publicId') publicIdRaw: string, @Body() body: unknown) {
    assertCanEdit(admin);
    const publicId = parseInput(publicIdParam, publicIdRaw);
    const input = parseInput(accountBody, body);
    const row = await this.db
      .selectFrom('member.users as u')
      .leftJoin('config.user_policy_overrides as o', 'o.user_id', 'u.id')
      .select(['u.id', 'u.country', 'u.plan', 'u.plan_expires_at', 'o.policy as override'])
      .where('u.public_id', '=', publicId)
      .executeTakeFirst();
    if (!row) throw new NotFoundException('없는 사용자입니다');

    const before = { country: row.country, plan: row.plan, planExpiresAt: day(row.plan_expires_at) };
    const after = {
      country: input.country ?? before.country,
      plan: input.plan ?? before.plan,
      planExpiresAt: input.planExpiresAt === undefined ? before.planExpiresAt : input.planExpiresAt,
    };
    const changed = (Object.keys(after) as (keyof typeof after)[]).filter((k) => after[k] !== before[k]);
    if (changed.length === 0) return { publicId, changed: [], overrideCleared: false };

    const planChanged = after.plan !== before.plan;
    await this.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('member.users')
        .set({
          country: after.country,
          plan: after.plan,
          // 만료일은 그날 끝까지 씁니다 (한국 시간 23:59:59)
          plan_expires_at: after.planExpiresAt ? new Date(`${after.planExpiresAt}T23:59:59+09:00`) : null,
          updated_at: new Date(),
        })
        .where('id', '=', row.id)
        .execute();
      if (planChanged && row.override) await trx.deleteFrom('config.user_policy_overrides').where('user_id', '=', row.id).execute();
      await trx
        .insertInto('config.policy_audit')
        .values({
          admin_id: admin.id,
          scope: 'user',
          target: publicId,
          before: JSON.stringify({ account: before, ...(planChanged && row.override ? { override: row.override } : {}) }),
          after: JSON.stringify({ account: after }),
        })
        .execute();
    });
    return { publicId, changed, overrideCleared: planChanged && !!row.override };
  }
}
