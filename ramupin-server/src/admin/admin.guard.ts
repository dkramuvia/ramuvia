import { Injectable, createParamDecorator, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

import { appError } from '../common/app-error.js';

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

interface AdminTokenPayload {
  sub: string;
  loginId: string;
  name: string;
  role: AdminRole;
  aud: string;
}

/**
 * 관리자 화면 인증.
 *
 * 앱과 달리 httpOnly 쿠키를 씁니다. 관리자 화면은 브라우저에서 열리므로,
 * 토큰을 자바스크립트가 읽을 수 있는 곳(localStorage)에 두면 스크립트 한 줄에 새어 나갑니다.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

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
    request.admin = { id: payload.sub, loginId: payload.loginId, name: payload.name, role: payload.role };
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

export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}
