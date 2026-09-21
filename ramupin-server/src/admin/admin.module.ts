import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Module,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

import { appError, parseInput } from '../common/app-error.js';
import { env } from '../config/env.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { AnomalyModule } from '../anomaly/anomaly.module.js';
import { ADMIN_AUDIENCE, ADMIN_COOKIE, AdminGuard, CurrentAdmin, assertCanEdit, type AdminUser } from './admin.guard.js';
import { MonitoringController } from './monitoring.controller.js';
import { hashPassword, verifyPassword } from './admin-password.js';
import { POLICY_FIELDS, applyPatch, parsePolicyPatch } from './policy-fields.js';

const ADMIN_PAGE = new URL('./admin-page.html', import.meta.url);

/** 관리자 로그인 유지 시간. 자리를 비웠을 때 오래 열려 있지 않게 짧게 둡니다 */
const ADMIN_SESSION = '8h';

const loginBody = z.object({ loginId: z.string().min(1).max(64), password: z.string().min(1).max(200) });
const publicIdParam = z.string().regex(/^\d{8}$/, '8자리 사용자 ID');

@Controller('admin')
class AdminPageController {
  /** 관리자 화면. 파일 하나라 별도 정적 서버 없이 그대로 내려 줍니다 */
  @Get()
  async page(@Res() response: Response) {
    const html = await readFile(ADMIN_PAGE, 'utf8');
    response.type('html').send(html);
  }
}

@Controller('admin/api')
class AdminAuthController {
  constructor(
    @Inject(MAIN_DB) private readonly db: MainDb,
    private readonly jwt: JwtService,
  ) {}

  @Post('login')
  async login(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const { loginId, password } = parseInput(loginBody, body);
    const row = await this.db
      .selectFrom('config.admin_users')
      .select(['id', 'login_id', 'password_hash', 'name', 'role', 'disabled'])
      .where('login_id', '=', loginId)
      .executeTakeFirst();

    // 아이디가 없을 때도 같은 시간이 걸리도록 해시 검사를 항상 돌립니다 (아이디가 있는지 새어 나가지 않게)
    const stored = row?.password_hash ?? (await DUMMY_HASH);
    const ok = await verifyPassword(password, stored);
    if (!row || !ok || row.disabled) throw appError(401, 'ADMIN_LOGIN_FAILED', '아이디 또는 비밀번호가 다릅니다');

    const token = await this.jwt.signAsync(
      { sub: row.id, loginId: row.login_id, name: row.name, role: row.role },
      { audience: ADMIN_AUDIENCE, expiresIn: ADMIN_SESSION },
    );
    response.cookie(ADMIN_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: env.NODE_ENV === 'production',
      path: '/admin',
    });
    await this.db.updateTable('config.admin_users').set({ last_login_at: new Date() }).where('id', '=', row.id).execute();
    return { name: row.name, role: row.role };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie(ADMIN_COOKIE, { path: '/admin' });
    return { ok: true };
  }
}

@Controller('admin/api')
@UseGuards(AdminGuard)
class AdminPolicyController {
  constructor(@Inject(MAIN_DB) private readonly db: MainDb) {}

  /** 로그인한 관리자 정보 + 화면을 그리는 데 필요한 항목 정의 */
  @Get('me')
  me(@CurrentAdmin() admin: AdminUser) {
    return { name: admin.name, role: admin.role, fields: POLICY_FIELDS };
  }

  /** 등급별 정책 전체 */
  @Get('plans')
  async plans() {
    const rows = await this.db.selectFrom('config.plan_policies').select(['plan', 'policy', 'updated_at']).orderBy('plan').execute();
    return rows.map((r) => ({ plan: r.plan, policy: r.policy, updatedAt: r.updated_at }));
  }

  /** 등급 정책 수정. 보낸 항목만 바뀝니다 */
  @Put('plans/:plan')
  async updatePlan(@CurrentAdmin() admin: AdminUser, @Param('plan') plan: string, @Body() body: unknown) {
    assertCanEdit(admin);
    const patch = parsePolicyPatch(body);
    const row = await this.db.selectFrom('config.plan_policies').select('policy').where('plan', '=', plan).executeTakeFirst();
    if (!row) throw new NotFoundException('없는 등급입니다');

    const next = applyPatch(row.policy, patch);
    await this.db
      .updateTable('config.plan_policies')
      .set({ policy: JSON.stringify(next), updated_at: new Date() })
      .where('plan', '=', plan)
      .execute();
    await this.audit(admin.id, 'plan', plan, row.policy, next);
    return { plan, policy: next };
  }

  /**
   * 사용자 한 명만 다르게 (등급 정책 위에 덮어씀).
   * 예: 치매 어르신 한 분만 더 촘촘하게 보고 싶을 때.
   */
  @Get('users/:publicId')
  async user(@Param('publicId') publicIdRaw: string) {
    const publicId = parseInput(publicIdParam, publicIdRaw);
    const row = await this.db
      .selectFrom('member.users as u')
      .leftJoin('config.user_policy_overrides as o', 'o.user_id', 'u.id')
      .select(['u.id', 'u.public_id', 'u.nickname', 'u.plan', 'o.policy as override'])
      .where('u.public_id', '=', publicId)
      .executeTakeFirst();
    if (!row) throw new NotFoundException('없는 사용자입니다');
    return { publicId: row.public_id, nickname: row.nickname, plan: row.plan, override: row.override ?? null };
  }

  @Put('users/:publicId')
  async updateUser(@CurrentAdmin() admin: AdminUser, @Param('publicId') publicIdRaw: string, @Body() body: unknown) {
    assertCanEdit(admin);
    const publicId = parseInput(publicIdParam, publicIdRaw);
    const patch = parsePolicyPatch(body);
    const row = await this.db
      .selectFrom('member.users as u')
      .leftJoin('config.user_policy_overrides as o', 'o.user_id', 'u.id')
      .select(['u.id', 'o.policy as override'])
      .where('u.public_id', '=', publicId)
      .executeTakeFirst();
    if (!row) throw new NotFoundException('없는 사용자입니다');

    const before = row.override ?? {};
    const next = applyPatch(before, patch);
    await this.db
      .insertInto('config.user_policy_overrides')
      .values({ user_id: row.id, policy: JSON.stringify(next), updated_at: new Date() })
      .onConflict((oc) => oc.column('user_id').doUpdateSet({ policy: JSON.stringify(next), updated_at: new Date() }))
      .execute();
    await this.audit(admin.id, 'user', publicId, before, next);
    return { publicId, override: next };
  }

  /** 사용자별 예외를 지워 등급 기본값으로 되돌립니다 */
  @Delete('users/:publicId')
  async clearUser(@CurrentAdmin() admin: AdminUser, @Param('publicId') publicIdRaw: string) {
    assertCanEdit(admin);
    const publicId = parseInput(publicIdParam, publicIdRaw);
    const row = await this.db
      .selectFrom('member.users as u')
      .leftJoin('config.user_policy_overrides as o', 'o.user_id', 'u.id')
      .select(['u.id', 'o.policy as override'])
      .where('u.public_id', '=', publicId)
      .executeTakeFirst();
    if (!row) throw new NotFoundException('없는 사용자입니다');
    if (!row.override) return { publicId, override: null };

    await this.db.deleteFrom('config.user_policy_overrides').where('user_id', '=', row.id).execute();
    await this.audit(admin.id, 'user', publicId, row.override, {});
    return { publicId, override: null };
  }

  /** 변경 이력 */
  @Get('audit')
  async audits(@Query('limit') limitRaw?: string) {
    const limit = Math.min(Number(limitRaw) || 50, 200);
    const rows = await this.db
      .selectFrom('config.policy_audit as a')
      .innerJoin('config.admin_users as u', 'u.id', 'a.admin_id')
      .select(['a.id', 'a.scope', 'a.target', 'a.before', 'a.after', 'a.created_at', 'u.name as adminName'])
      .orderBy('a.created_at', 'desc')
      .limit(limit)
      .execute();
    return rows.map((r) => ({
      id: r.id,
      scope: r.scope,
      target: r.target,
      changes: diff(r.before, r.after),
      adminName: r.adminName,
      createdAt: r.created_at,
    }));
  }

  private async audit(
    adminId: string,
    scope: 'plan' | 'user',
    target: string,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ) {
    await this.db
      .insertInto('config.policy_audit')
      .values({ admin_id: adminId, scope, target, before: JSON.stringify(before), after: JSON.stringify(after) })
      .execute();
  }
}

/** 바뀐 항목만 뽑습니다 (점 표기로 평탄화해 비교) */
function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const flat = (source: Record<string, unknown>, prefix = ''): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(out, flat(value as Record<string, unknown>, prefix + key + '.'));
      } else {
        out[prefix + key] = value;
      }
    }
    return out;
  };
  const a = flat(before);
  const b = flat(after);
  const changes: { key: string; before: unknown; after: unknown }[] = [];
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) changes.push({ key, before: a[key], after: b[key] });
  }
  return changes;
}

/** 아이디가 없을 때도 같은 시간이 걸리게 하는 비교용 해시 */
const DUMMY_HASH = hashPassword('ramupin-dummy-password');

@Module({
  imports: [JwtModule.register({ secret: env.JWT_SECRET }), AnomalyModule],
  controllers: [AdminPageController, AdminAuthController, AdminPolicyController, MonitoringController],
  providers: [AdminGuard],
})
export class AdminModule {}
