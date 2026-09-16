import { HttpStatus, Injectable, createParamDecorator, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import type { Request } from 'express';

import { authError } from './auth-error.js';
import { SessionService, type AccessTokenPayload } from './session.service.js';

export interface AuthUser {
  id: string;
  sessionId: string;
}

/**
 * Authorization: Bearer <access token> 검사.
 * 토큰 서명·만료뿐 아니라 "지금 이 사용자의 활성 세션인지"도 확인합니다 (기기 1대 로그인).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    if (type !== 'Bearer' || !token) throw authError(HttpStatus.UNAUTHORIZED, 'TOKEN_MISSING');

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch (error) {
      throw authError(HttpStatus.UNAUTHORIZED, error instanceof TokenExpiredError ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID');
    }
    // 세션 도입 전에 발급된 토큰
    if (!payload.sid) throw authError(HttpStatus.UNAUTHORIZED, 'SESSION_REVOKED');

    await this.sessions.assertActive(payload.sub, payload.sid);
    request.user = { id: payload.sub, sessionId: payload.sid };
    return true;
  }
}

/** 컨트롤러에서 로그인한 사용자: `@CurrentUser() user: AuthUser` */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthUser => {
  const request = context.switchToHttp().getRequest<Request & { user: AuthUser }>();
  return request.user;
});
