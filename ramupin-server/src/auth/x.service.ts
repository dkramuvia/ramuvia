import { HttpStatus, Injectable, Logger } from '@nestjs/common';

import { appError } from '../common/app-error.js';
import { env } from '../config/env.js';

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface XMeResponse {
  data?: { id: string; name?: string; username?: string; profile_image_url?: string };
}

export interface XUser {
  providerUserId: string;
  nickname: string | null;
  avatarUrl: string | null;
}

const TOKEN_URL = 'https://api.x.com/2/oauth2/token';
const ME_URL = 'https://api.x.com/2/users/me?user.fields=profile_image_url';
const TIMEOUT_MS = 8000;

/**
 * X(트위터) 로그인.
 *
 * 카카오와 방식이 다릅니다. 카카오는 앱이 받은 access token 을 서버가 확인했지만,
 * X 는 "이 토큰이 우리 앱에서 발급된 것인지" 확인할 방법을 주지 않습니다.
 * 그래서 앱에서는 **인가 코드(code)만** 받아 오고, **토큰 교환은 서버가 직접** 합니다.
 * 우리 client_id 로 교환에 성공했다는 것 자체가 "우리 앱에서 나온 코드"라는 증거입니다.
 *
 * 공개 클라이언트(PKCE)라 client secret 은 쓰지 않습니다. 앱이 만든 code_verifier 를 함께 보냅니다.
 */
@Injectable()
export class XService {
  private readonly logger = new Logger(XService.name);

  async verify(code: string, codeVerifier: string, redirectUri: string): Promise<XUser> {
    const accessToken = await this.exchange(code, codeVerifier, redirectUri);

    const me = await this.fetchJson<XMeResponse>(ME_URL, { authorization: `Bearer ${accessToken}` });
    const user = me.data;
    if (!user?.id) {
      throw appError(HttpStatus.UNAUTHORIZED, 'X_TOKEN_INVALID', 'X 계정 정보를 가져오지 못했습니다');
    }

    return {
      providerUserId: user.id,
      nickname: user.name ?? user.username ?? null,
      // 기본 프로필 사진은 _normal 로 작게 옵니다. 원본 크기로 바꿔 둡니다
      avatarUrl: user.profile_image_url?.replace('_normal', '') ?? null,
    };
  }

  /** 인가 코드를 access token 으로 바꿉니다 (PKCE) */
  private async exchange(code: string, codeVerifier: string, redirectUri: string): Promise<string> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: env.X_CLIENT_ID,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    });

    let response: Response;
    try {
      response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.error(`X 토큰 교환 실패: ${String(error)}`);
      throw appError(HttpStatus.BAD_GATEWAY, 'X_UNAVAILABLE', 'X 서버에 연결하지 못했습니다');
    }

    if (!response.ok) {
      // 코드가 이미 쓰였거나, redirect_uri 가 등록된 것과 다르거나, code_verifier 가 안 맞는 경우
      const detail = await response.text().catch(() => '');
      this.logger.warn(`X 토큰 교환 거부 ${response.status}: ${detail.slice(0, 300)}`);
      throw appError(HttpStatus.UNAUTHORIZED, 'X_CODE_INVALID', 'X 로그인에 실패했습니다');
    }

    const token = (await response.json()) as TokenResponse;
    if (!token.access_token) {
      throw appError(HttpStatus.UNAUTHORIZED, 'X_CODE_INVALID', 'X 로그인에 실패했습니다');
    }
    return token.access_token;
  }

  private async fetchJson<T>(url: string, headers: Record<string, string>): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (error) {
      this.logger.error(`X 호출 실패: ${String(error)}`);
      throw appError(HttpStatus.BAD_GATEWAY, 'X_UNAVAILABLE', 'X 서버에 연결하지 못했습니다');
    }
    if (!response.ok) {
      this.logger.warn(`X 응답 ${response.status}`);
      throw appError(HttpStatus.UNAUTHORIZED, 'X_TOKEN_INVALID', 'X 계정 정보를 가져오지 못했습니다');
    }
    return (await response.json()) as T;
  }
}
