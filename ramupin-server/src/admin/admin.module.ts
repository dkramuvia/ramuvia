import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Logger,
  Module,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

import { appError, parseInput } from '../common/app-error.js';
import { env } from '../config/env.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { AnomalyModule } from '../anomaly/anomaly.module.js';
import { LocationModule } from '../location/location.module.js';
import { PhoneModule } from '../phone/phone.module.js';
import { REDIS } from '../redis/redis.module.js';
import {
  ADMIN_AUDIENCE,
  ADMIN_COOKIE,
  ADMIN_SESSION_SEC,
  AdminGuard,
  CurrentAdmin,
  adminSessionKey,
  assertCanEdit,
  clientIp,
  readCookie,
  type AdminTokenPayload,
  type AdminUser,
} from './admin.guard.js';
import { AdminUsersController } from './admin-users.controller.js';
import { LogsController } from './logs.controller.js';
import { MonitoringController } from './monitoring.controller.js';
import { OverviewController } from './overview.controller.js';
import { hashPassword, verifyPassword } from './admin-password.js';
import { POLICY_FIELDS, applyPatch, parsePolicyPatch } from './policy-fields.js';

const ADMIN_PAGE = new URL('./admin-page.html', import.meta.url);

/**
 * 로그인 실패 제한. 같은 곳(IP)에서 같은 아이디로 15분에 5번 틀리면 15분 동안 막습니다.
 * 막혀 있는 동안은 맞는 비밀번호도 받지 않습니다 — 받으면 막아도 계속 맞혀 볼 수 있습니다 (10-12 자동 시험)
 */
const LOGIN_FAIL_LIMIT = 5;
const LOGIN_FAIL_WINDOW_SEC = 15 * 60;

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
  private readonly logger = new Logger('AdminAuth');

  constructor(
    @Inject(MAIN_DB) private readonly db: MainDb,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly jwt: JwtService,
  ) {}

  @Post('login')
  async login(@Req() request: Request, @Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const { loginId, password } = parseInput(loginBody, body);
    const ip = clientIp(request);
    // 같은 곳(IP)에서 틀린 횟수를 셉니다. 전에는 nginx 주소로 세어서 모든 관리자가 한 칸을 같이 썼습니다
    const failKey = `admin:login-fail:${ip ?? ''}:${loginId}`;
    if (Number(await this.redis.get(failKey)) >= LOGIN_FAIL_LIMIT) {
      await this.logAccess(request, null, loginId, 'login_locked');
      const retryAfterSec = Math.max(await this.redis.ttl(failKey), 1);
      throw appError(429, 'ADMIN_LOGIN_LOCKED', `로그인 실패가 많아 잠시 막았습니다. ${Math.ceil(retryAfterSec / 60)}분 뒤에 다시 시도하세요`, {
        retryAfterSec,
      });
    }

    const row = await this.db
      .selectFrom('config.admin_users')
      .select(['id', 'login_id', 'password_hash', 'name', 'role', 'disabled'])
      .where('login_id', '=', loginId)
      .executeTakeFirst();

    // 아이디가 없을 때도 같은 시간이 걸리도록 해시 검사를 항상 돌립니다 (아이디가 있는지 새어 나가지 않게)
    const stored = row?.password_hash ?? (await DUMMY_HASH);
    const ok = await verifyPassword(password, stored);
    if (!row || !ok || row.disabled) {
      const fails = await this.redis.incr(failKey);
      if (fails === 1) await this.redis.expire(failKey, LOGIN_FAIL_WINDOW_SEC);
      await this.logAccess(request, row?.id ?? null, loginId, 'login_failed');
      throw appError(401, 'ADMIN_LOGIN_FAILED', '아이디 또는 비밀번호가 다릅니다');
    }
    await this.redis.del(failKey);
    await this.logAccess(request, row.id, row.login_id, 'login');

    // 로그아웃하면 이 세션을 지워, 쿠키를 복사해 둔 사람도 더는 못 쓰게 합니다 (AdminGuard)
    const sid = randomUUID();
    await this.redis.set(adminSessionKey(sid), row.id, 'EX', ADMIN_SESSION_SEC);
    const token = await this.jwt.signAsync(
      { sub: row.id, loginId: row.login_id, name: row.name, role: row.role, sid },
      { audience: ADMIN_AUDIENCE, expiresIn: ADMIN_SESSION_SEC },
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
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    // 브라우저 쿠키만 지우면 토큰 자체는 8시간 동안 살아 있었습니다. 서버 세션도 지웁니다 (10-12 자동 시험)
    const token = readCookie(request.headers.cookie, ADMIN_COOKIE);
    if (token) {
      const payload = await this.jwt
        .verifyAsync<AdminTokenPayload>(token, { audience: ADMIN_AUDIENCE, ignoreExpiration: true })
        .catch(() => null);
      if (payload?.sid) await this.redis.del(adminSessionKey(payload.sid));
      if (payload) await this.logAccess(request, payload.sub, payload.loginId, 'logout');
    }
    response.clearCookie(ADMIN_COOKIE, { path: '/admin' });
    return { ok: true };
  }

  /**
   * 관리자 접근기록 (위치정보사업 신고 [첨부 2]: 위치정보시스템의 관리자 접근사실 기록).
   * 기록이 실패했다고 로그인을 막지는 않습니다 — 실패는 서버 로그에 남깁니다
   */
  private async logAccess(request: Request, adminId: string | null, loginId: string, action: 'login' | 'login_failed' | 'login_locked' | 'logout') {
    await this.db
      .insertInto('config.admin_access_logs')
      .values({
        admin_id: adminId,
        login_id: loginId.slice(0, 64),
        action,
        ip: clientIp(request),
        user_agent: (request.headers['user-agent'] ?? '').slice(0, 300) || null,
      })
      .execute()
      .catch((error: unknown) => this.logger.error(`관리자 접근기록 실패: ${String(error)}`));
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
   * 사용자 한 명만 다르게 (등급 정책 위에 덮어씀).  예: 치매 어르신 한 분만 더 촘촘하게 보고 싶을 때.
   * 사용자 조회·검색·계정 정보는 admin-users.controller.ts 에 있습니다
   */
  @Put('users/:publicId')
  async updateUser(
    @CurrentAdmin() admin: AdminUser,
    @Param('publicId') publicIdRaw: string,
    @Body() body: unknown,
    @Query('replace') replace?: string,
  ) {
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
    // replace=1: 보낸 항목만 남깁니다 (관제센터 03 은 등급 기본값과 다른 항목만 모아 통째로 저장)
    const next = applyPatch(replace === '1' ? {} : before, patch);
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
  // 위치 확인자료 조회·관제센터 열람 기록 (LocationService)
  imports: [JwtModule.register({ secret: env.JWT_SECRET }), AnomalyModule, PhoneModule, LocationModule],
  controllers: [AdminPageController, AdminAuthController, AdminPolicyController, AdminUsersController, MonitoringController, OverviewController, LogsController],
  providers: [AdminGuard],
})
export class AdminModule {}
