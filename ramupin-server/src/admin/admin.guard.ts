import { Inject, Injectable, createParamDecorator, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { Redis } from 'ioredis';

import { appError } from '../common/app-error.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { REDIS } from '../redis/redis.module.js';

export type AdminRole = 'viewer' | 'editor' | 'owner';

export interface AdminUser {
  id: string;
  loginId: string;
  name: string;
  role: AdminRole;
}

export const ADMIN_COOKIE = 'ramupin_admin';

/** 관리자 토큰은 앱 토큰과 섞이면 안 되므로 용도(aud)를 따로 둡니다 */
export const ADMIN_AUDIENCE = 'ramupin-admin';

export interface AdminTokenPayload {
  sub: string;
  loginId: string;
  name: string;
  role: AdminRole;
  aud: string;
  /** 서버 쪽 세션 id. 로그아웃하면 Redis 에서 지워져 같은 쿠키를 다시 써도 막힙니다 */
  sid?: string;
}

/** 관리자 로그인 유지 시간(초). 토큰 만료(8h)와 같게 둡니다 */
export const ADMIN_SESSION_SEC = 8 * 60 * 60;
export const adminSessionKey = (sid: string) => `admin:session:${sid}`;

/**
 * 관리자 화면 인증.
 *
 * 앱과 달리 httpOnly 쿠키를 씁니다. 관리자 화면은 브라우저에서 열리므로,
 * 토큰을 자바스크립트가 읽을 수 있는 곳(localStorage)에 두면 스크립트 한 줄에 새어 나갑니다.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    @Inject(MAIN_DB) private readonly db: MainDb,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { admin?: AdminUser }>();
    const token = readCookie(request.headers.cookie, ADMIN_COOKIE);
    if (!token) throw appError(401, 'ADMIN_UNAUTHORIZED', '로그인이 필요합니다');

    let payload: AdminTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AdminTokenPayload>(token, { audience: ADMIN_AUDIENCE });
    } catch {
      throw appError(401, 'ADMIN_UNAUTHORIZED', '로그인이 만료되었습니다');
    }

    // 토큰만 보면 로그아웃·계정 정지 뒤에도 8시간 동안 그대로 들어왔습니다 (10-12 자동 시험).
    // 세션이 살아 있는지, 계정이 아직 쓸 수 있는지를 매번 확인합니다 (관리자 요청은 적어서 부담이 없습니다)
    if (!payload.sid || !(await this.redis.exists(adminSessionKey(payload.sid)))) {
      throw appError(401, 'ADMIN_UNAUTHORIZED', '로그인이 만료되었습니다');
    }
    const row = await this.db
      .selectFrom('config.admin_users')
      .select(['login_id', 'name', 'role', 'disabled'])
      .where('id', '=', payload.sub)
      .executeTakeFirst();
    if (!row || row.disabled) {
      await this.redis.del(adminSessionKey(payload.sid));
      throw appError(401, 'ADMIN_UNAUTHORIZED', '사용할 수 없는 계정입니다');
    }
    // 권한도 DB 값으로 (로그인 뒤에 바뀌었을 수 있습니다)
    request.admin = { id: payload.sub, loginId: row.login_id, name: row.name, role: row.role };
    return true;
  }
}

/** 컨트롤러에서 로그인한 관리자: `@CurrentAdmin() admin: AdminUser` */
export const CurrentAdmin = createParamDecorator((_data: unknown, context: ExecutionContext): AdminUser => {
  return context.switchToHttp().getRequest<Request & { admin: AdminUser }>().admin;
});

/** 수정 권한 확인. viewer 는 보기만 됩니다 */
export function assertCanEdit(admin: AdminUser) {
  if (admin.role === 'viewer') throw appError(403, 'ADMIN_READ_ONLY', '보기 권한만 있습니다');
}

/**
 * 접속한 사람의 IP. 서버 앞에 nginx 가 있어 request.ip 는 nginx 주소가 됩니다.
 * nginx 가 넣어 주는 X-Real-IP 를 씁니다 (docker/nginx/nginx.conf). API 는 nginx 를 거쳐서만 닿습니다
 */
export function clientIp(request: { headers: Record<string, string | string[] | undefined>; ip?: string }): string | null {
  const real = request.headers['x-real-ip'];
  return (Array.isArray(real) ? real[0] : real) || request.ip || null;
}

export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}
