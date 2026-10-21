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
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

import { appError, parseInput } from '../common/app-error.js';
import { env } from '../config/env.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import type { AdminAccessAction } from '../database/main.schema.js';
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
import { OTP_ISSUER, decryptOtpSecret, encryptOtpSecret, generateOtpSecret, otpQrDataUrl, verifyTotp } from './admin-otp.js';
import { hashPassword, verifyPassword } from './admin-password.js';
import { POLICY_FIELDS, applyPatch, parsePolicyPatch } from './policy-fields.js';

const ADMIN_PAGE = new URL('./admin-page.html', import.meta.url);

/**
 * 로그인 실패 제한. 같은 곳(IP)에서 같은 아이디로 30분에 5번 틀리면 30분 동안 막습니다.
 * 막혀 있는 동안은 맞는 비밀번호도 받지 않습니다 — 받으면 막아도 계속 맞혀 볼 수 있습니다 (10-12 자동 시험)
 */
const LOGIN_FAIL_LIMIT = 5;
// 계정 잠금(30분)과 같은 시간으로 둡니다 — 안내 문구와 잠긴 시간이 어긋나지 않게
const LOGIN_FAIL_WINDOW_SEC = 30 * 60;

/** 계정 잠금: 비밀번호·OTP 를 연속 이만큼 틀리면 (위치정보사업 신고 [첨부 2]: 5회 오류 잠금) */
const ACCOUNT_LOCK_LIMIT = 5;
const ACCOUNT_LOCK_SEC = 30 * 60;
/** 비밀번호를 맞힌 뒤 OTP 를 넣을 시간 */
const OTP_CHALLENGE_SEC = 5 * 60;
const otpChallengeKey = (challenge: string) => `admin:otp-challenge:${challenge}`;

const lockedError = (retryAfterSec: number) =>
  appError(
    423,
    'ADMIN_LOGIN_LOCKED',
    `비밀번호 또는 인증번호를 ${ACCOUNT_LOCK_LIMIT}회 잘못 입력해 로그인이 잠겼습니다. ${Math.ceil(retryAfterSec / 60)}분 뒤에 다시 시도하거나 최고 관리자에게 잠금 해제를 요청하세요`,
    { retryAfterSec },
  );

const loginBody = z.object({ loginId: z.string().min(1).max(64), password: z.string().min(1).max(200) });
const otpBody = z.object({ challenge: z.string().min(16).max(100), code: z.string().min(6).max(12) });
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

  /**
   * 1단계: 아이디·비밀번호. 맞으면 OTP 단계로 넘어갑니다 (등록 전이면 QR 등록 화면).
   *
   * 잠금은 두 가지입니다.
   *  - 계정: 비밀번호·OTP 를 연속 5회 틀리면 그 계정을 30분 잠급니다. IP 를 바꿔도 소용없습니다.
   *  - IP: 같은 곳에서 같은 아이디로 30분에 5번 — 없는 아이디를 계속 넣어 보는 것을 막습니다.
   * 잠겨 있는 동안은 맞는 비밀번호도 받지 않습니다 — 받으면 막아도 계속 맞혀 볼 수 있습니다 (10-12 자동 시험)
   */
  @Post('login')
  async login(@Req() request: Request, @Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const { loginId, password } = parseInput(loginBody, body);
    const ip = clientIp(request);
    // 같은 곳(IP)에서 틀린 횟수를 셉니다. 전에는 nginx 주소로 세어서 모든 관리자가 한 칸을 같이 썼습니다
    const failKey = `admin:login-fail:${ip ?? ''}:${loginId}`;
    const ipFails = Number(await this.redis.get(failKey));
    if (ipFails >= LOGIN_FAIL_LIMIT) {
      await this.logAccess(request, null, loginId, 'login_locked');
      const retryAfterSec = Math.max(await this.redis.ttl(failKey), 1);
      throw lockedError(retryAfterSec);
    }

    const row = await this.db
      .selectFrom('config.admin_users')
      .select(['id', 'login_id', 'password_hash', 'name', 'role', 'disabled', 'otp_enabled', 'otp_secret_enc', 'failed_count', 'locked_until'])
      .where('login_id', '=', loginId)
      .executeTakeFirst();

    if (row?.locked_until && row.locked_until.getTime() > Date.now()) {
      await this.logAccess(request, row.id, loginId, 'login_locked');
      throw lockedError(Math.ceil((row.locked_until.getTime() - Date.now()) / 1000));
    }

    // 아이디가 없을 때도 같은 시간이 걸리도록 해시 검사를 항상 돌립니다 (아이디가 있는지 새어 나가지 않게)
    const stored = row?.password_hash ?? (await DUMMY_HASH);
    const ok = await verifyPassword(password, stored);
    if (!row || !ok || row.disabled) {
      const fails = await this.redis.incr(failKey);
      if (fails === 1) await this.redis.expire(failKey, LOGIN_FAIL_WINDOW_SEC);
      await this.logAccess(request, row?.id ?? null, loginId, 'login_failed');
      // 없는 아이디도 같은 모양으로 답합니다 (남은 횟수는 IP 기준) — 아이디가 있는지 새어 나가지 않게
      const remaining = row && !row.disabled ? await this.registerFailure(request, row.id, row.login_id) : LOGIN_FAIL_LIMIT - fails;
      if (remaining <= 0) throw lockedError(ACCOUNT_LOCK_SEC);
      throw appError(401, 'ADMIN_LOGIN_FAILED', `아이디 또는 비밀번호가 다릅니다. (남은 시도 ${remaining}회)`, { remainingAttempts: remaining });
    }
    await this.redis.del(failKey);

    if (!env.ADMIN_OTP_REQUIRED) return this.issueSession(request, response, row);

    // 2단계(OTP)로. 비밀번호를 맞혔다는 표시는 5분짜리 일회용 열쇠로만 넘깁니다
    const challenge = randomBytes(24).toString('base64url');
    if (row.otp_enabled && row.otp_secret_enc) {
      await this.redis.set(otpChallengeKey(challenge), JSON.stringify({ adminId: row.id }), 'EX', OTP_CHALLENGE_SEC);
      return { status: 'otp_required' as const, challenge };
    }
    // 처음 로그인: 인증 앱에 등록할 비밀값을 만들어 보여 줍니다. 숫자를 한 번 맞혀야 저장됩니다
    const secret = generateOtpSecret();
    await this.redis.set(otpChallengeKey(challenge), JSON.stringify({ adminId: row.id, pendingSecret: secret }), 'EX', OTP_CHALLENGE_SEC);
    return {
      status: 'otp_enroll' as const,
      challenge,
      qr: await otpQrDataUrl(row.login_id, secret),
      // QR 을 못 찍을 때 인증 앱에 직접 넣는 키 (4자리씩 띄어 보여 줍니다)
      secret: secret.replace(/(.{4})/g, '$1 ').trim(),
      issuer: OTP_ISSUER,
      account: row.login_id,
    };
  }

  /** 2단계: 인증 앱의 6자리 숫자 */
  @Post('login/otp')
  async loginOtp(@Req() request: Request, @Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const { challenge, code } = parseInput(otpBody, body);
    const raw = await this.redis.get(otpChallengeKey(challenge));
    if (!raw) throw appError(401, 'ADMIN_OTP_EXPIRED', '인증 시간이 지났습니다. 아이디와 비밀번호부터 다시 입력하세요');
    const pending = JSON.parse(raw) as { adminId: string; pendingSecret?: string };

    const row = await this.db
      .selectFrom('config.admin_users')
      .select(['id', 'login_id', 'name', 'role', 'disabled', 'otp_enabled', 'otp_secret_enc', 'locked_until'])
      .where('id', '=', pending.adminId)
      .executeTakeFirst();
    if (!row || row.disabled) throw appError(401, 'ADMIN_LOGIN_FAILED', '로그인할 수 없는 계정입니다');
    if (row.locked_until && row.locked_until.getTime() > Date.now()) {
      await this.redis.del(otpChallengeKey(challenge));
      await this.logAccess(request, row.id, row.login_id, 'login_locked');
      throw lockedError(Math.ceil((row.locked_until.getTime() - Date.now()) / 1000));
    }

    const secret = pending.pendingSecret ?? (row.otp_secret_enc ? decryptOtpSecret(row.otp_secret_enc) : null);
    const step = secret ? verifyTotp(secret, code.replace(/\s/g, '')) : null;
    // 같은 숫자를 두 번 쓰지 못하게 합니다 (어깨너머로 본 숫자를 30초 안에 다시 넣는 것)
    const fresh = step !== null && (await this.redis.set(`admin:otp-used:${row.id}:${step}`, '1', 'EX', 120, 'NX')) === 'OK';
    if (!fresh) {
      await this.logAccess(request, row.id, row.login_id, 'otp_failed');
      const remaining = await this.registerFailure(request, row.id, row.login_id);
      if (remaining <= 0) {
        await this.redis.del(otpChallengeKey(challenge));
        throw lockedError(ACCOUNT_LOCK_SEC);
      }
      throw appError(401, 'ADMIN_OTP_FAILED', `인증번호가 맞지 않습니다. (남은 시도 ${remaining}회)`, { remainingAttempts: remaining });
    }

    await this.redis.del(otpChallengeKey(challenge));
    if (pending.pendingSecret) {
      await this.db
        .updateTable('config.admin_users')
        .set({ otp_secret_enc: encryptOtpSecret(pending.pendingSecret), otp_enabled: true, updated_at: new Date() })
        .where('id', '=', row.id)
        .execute();
      await this.logAccess(request, row.id, row.login_id, 'otp_enrolled');
    }
    return this.issueSession(request, response, row);
  }

  /**
   * 틀린 횟수를 올리고 남은 횟수를 돌려줍니다. 5회째면 30분 잠그고 0.
   * 계정 행에서 한 번에 올려, 여러 창에서 동시에 넣어도 횟수가 새지 않습니다
   */
  private async registerFailure(request: Request, adminId: string, loginId: string): Promise<number> {
    const updated = await this.db
      .updateTable('config.admin_users')
      .set((eb) => ({ failed_count: eb('failed_count', '+', 1) }))
      .where('id', '=', adminId)
      .returning('failed_count')
      .executeTakeFirstOrThrow();
    const remaining = ACCOUNT_LOCK_LIMIT - updated.failed_count;
    if (remaining > 0) return remaining;
    await this.db
      .updateTable('config.admin_users')
      .set({ locked_until: new Date(Date.now() + ACCOUNT_LOCK_SEC * 1000), failed_count: 0 })
      .where('id', '=', adminId)
      .execute();
    await this.logAccess(request, adminId, loginId, 'account_locked');
    return 0;
  }

  /** 모든 단계를 통과: 세션을 만들고 쿠키를 줍니다 */
  private async issueSession(
    request: Request,
    response: Response,
    row: { id: string; login_id: string; name: string; role: 'viewer' | 'editor' | 'owner' },
  ) {
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
    // 다 맞혔으니 틀린 횟수를 지웁니다 (연속 5회 기준)
    await this.db.updateTable('config.admin_users').set({ last_login_at: new Date(), failed_count: 0, locked_until: null }).where('id', '=', row.id).execute();
    return { status: 'ok' as const, name: row.name, role: row.role };
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
  private async logAccess(request: Request, adminId: string | null, loginId: string, action: AdminAccessAction) {
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
