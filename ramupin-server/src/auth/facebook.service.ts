import { createHmac } from 'node:crypto';

import { HttpStatus, Injectable, Logger } from '@nestjs/common';

import { appError } from '../common/app-error.js';
import { env } from '../config/env.js';

/**
 * 페이스북 로그인 (2026-10-15).
 *
 * **방식은 네이버와 같습니다.** 앱은 인가 코드만 받아 오고, 토큰 교환은 서버가 앱 시크릿으로 합니다.
 * 페이스북도 로그인을 마치고 돌아올 주소로 https 를 받으므로 우리 서버(`GET /auth/facebook/callback`)로
 * 먼저 보내고, 서버가 앱(`ramupin://facebook-auth`)으로 넘깁니다.
 *
 * 교환한 토큰이 **우리 앱에서 발급된 것인지** debug_token 으로 한 번 더 확인합니다.
 * 프로필 조회에는 appsecret_proof 를 붙입니다 (페이스북 권장, 토큰만 훔쳐서는 못 부르게).
 *
 * 받는 정보는 이름과 프로필 사진뿐입니다 (public_profile). 이메일은 저장하지 않으므로 요청하지 않습니다.
 */

const GRAPH = 'https://graph.facebook.com/v21.0';
const TIMEOUT_MS = 8000;

interface TokenResponse {
  access_token?: string;
  error?: { message?: string; type?: string; code?: number };
}

interface DebugTokenResponse {
  data?: { app_id?: string; is_valid?: boolean; user_id?: string };
}

interface MeResponse {
  id?: string;
  name?: string;
  picture?: { data?: { url?: string; is_silhouette?: boolean } };
}

export interface FacebookUser {
  providerUserId: string;
  nickname: string | null;
  avatarUrl: string | null;
}

@Injectable()
export class FacebookService {
  private readonly logger = new Logger(FacebookService.name);

  get enabled(): boolean {
    return !!env.FACEBOOK_APP_ID && !!env.FACEBOOK_APP_SECRET;
  }

  async verify(code: string, redirectUri: string): Promise<FacebookUser> {
    if (!this.enabled) {
      throw appError(HttpStatus.SERVICE_UNAVAILABLE, 'FACEBOOK_DISABLED', '페이스북 로그인이 아직 준비되지 않았습니다');
    }

    const accessToken = await this.exchange(code, redirectUri);

    // 이 토큰이 우리 앱 것인지 (다른 앱에서 받은 토큰으로 로그인하는 것을 막습니다)
    const debug = await this.get<DebugTokenResponse>('/debug_token', {
      input_token: accessToken,
      access_token: `${env.FACEBOOK_APP_ID}|${env.FACEBOOK_APP_SECRET}`,
    });
    if (!debug.data?.is_valid || debug.data.app_id !== env.FACEBOOK_APP_ID) {
      this.logger.warn(`다른 앱의 페이스북 토큰 (app ${debug.data?.app_id})`);
      throw appError(HttpStatus.UNAUTHORIZED, 'FACEBOOK_TOKEN_INVALID', '페이스북 계정 정보를 가져오지 못했습니다');
    }

    const me = await this.get<MeResponse>('/me', {
      fields: 'id,name,picture.type(large)',
      access_token: accessToken,
      appsecret_proof: createHmac('sha256', env.FACEBOOK_APP_SECRET).update(accessToken).digest('hex'),
    });
    if (!me.id || me.id !== debug.data.user_id) {
      throw appError(HttpStatus.UNAUTHORIZED, 'FACEBOOK_TOKEN_INVALID', '페이스북 계정 정보를 가져오지 못했습니다');
    }

    const picture = me.picture?.data;
    return {
      providerUserId: me.id,
      nickname: me.name ?? null,
      // 사진을 올리지 않은 계정은 회색 실루엣이 옵니다. 그건 쓰지 않습니다
      avatarUrl: picture?.url && !picture.is_silhouette ? picture.url : null,
    };
  }

  /** 인가 코드 → access token. 앱 시크릿이 들어가므로 서버에서만 합니다 */
  private async exchange(code: string, redirectUri: string): Promise<string> {
    const token = await this.get<TokenResponse>('/oauth/access_token', {
      client_id: env.FACEBOOK_APP_ID,
      client_secret: env.FACEBOOK_APP_SECRET,
      redirect_uri: redirectUri,
      code,
    });
    if (!token.access_token) {
      this.logger.warn(`페이스북 토큰 교환 거부: ${token.error?.message ?? '응답 없음'}`);
      throw appError(HttpStatus.UNAUTHORIZED, 'FACEBOOK_CODE_INVALID', '페이스북 로그인에 실패했습니다');
    }
    return token.access_token;
  }

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${GRAPH}${path}?${new URLSearchParams(params).toString()}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (error) {
      this.logger.error(`페이스북 연결 실패 (${path}): ${String(error)}`);
      throw appError(HttpStatus.BAD_GATEWAY, 'FACEBOOK_UNAVAILABLE', '페이스북 서버에 연결하지 못했습니다');
    }
    // 오류여도 본문에 error 가 담겨 오므로 호출한 쪽에서 판단합니다
    return (await response.json().catch(() => ({}))) as T;
  }
}
