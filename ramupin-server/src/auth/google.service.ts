import { HttpStatus, Injectable, Logger } from '@nestjs/common';

import { appError } from '../common/app-error.js';
import { env } from '../config/env.js';

/**
 * 구글 로그인 (WBS 3.8).
 *
 * **X 와 같은 방식입니다.** 앱은 인가 코드만 받아 오고, 토큰 교환은 서버가 합니다.
 * 안드로이드 클라이언트는 공개 클라이언트(PKCE)라 secret 이 없습니다.
 *
 * **왜 id_token 서명을 따로 확인하지 않나**: 이 토큰은 우리 서버가 구글의 토큰 발급
 * 주소에 HTTPS 로 직접 물어봐서 받은 것입니다. 중간에 누가 끼어들 수 없으므로
 * 서명을 다시 확인할 필요가 없습니다 (구글 문서도 이 경우는 생략할 수 있다고 안내합니다).
 * 앱이 건네준 토큰을 그냥 믿는 것과는 완전히 다릅니다 — 그건 위조할 수 있습니다.
 *
 * 그래도 `aud`(이 토큰을 받기로 된 앱)는 확인합니다. 교환이 우리 client_id 로 이뤄졌으니
 * 항상 맞아야 하지만, 설정이 어긋났을 때 조용히 지나가면 안 되는 종류의 값입니다.
 */

interface TokenResponse {
  id_token?: string;
  access_token?: string;
  error?: string;
  error_description?: string;
}

/** id_token 안에 들어 있는 내용 (구글이 서명해 준 것) */
interface IdTokenClaims {
  iss?: string;
  aud?: string;
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

export interface GoogleUser {
  providerUserId: string;
  nickname: string | null;
  avatarUrl: string | null;
  email: string | null;
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
const TIMEOUT_MS = 8000;

@Injectable()
export class GoogleService {
  private readonly logger = new Logger(GoogleService.name);

  get enabled(): boolean {
    return !!env.GOOGLE_CLIENT_ID;
  }

  async verify(code: string, codeVerifier: string, redirectUri: string): Promise<GoogleUser> {
    if (!this.enabled) {
      throw appError(HttpStatus.SERVICE_UNAVAILABLE, 'GOOGLE_DISABLED', '구글 로그인이 아직 준비되지 않았습니다');
    }

    const idToken = await this.exchange(code, codeVerifier, redirectUri);
    const claims = decodeClaims(idToken);

    if (!claims?.sub) throw appError(HttpStatus.UNAUTHORIZED, 'GOOGLE_TOKEN_INVALID', '구글 계정 정보를 가져오지 못했습니다');
    if (!claims.iss || !ISSUERS.has(claims.iss)) {
      this.logger.warn(`구글 토큰 발급처가 다릅니다: ${claims.iss}`);
      throw appError(HttpStatus.UNAUTHORIZED, 'GOOGLE_TOKEN_INVALID', '구글 계정 정보를 가져오지 못했습니다');
    }
    if (claims.aud !== env.GOOGLE_CLIENT_ID) {
      this.logger.warn(`다른 구글 앱의 토큰 (aud ${claims.aud})`);
      throw appError(HttpStatus.UNAUTHORIZED, 'GOOGLE_TOKEN_INVALID', '구글 계정 정보를 가져오지 못했습니다');
    }

    return {
      providerUserId: claims.sub,
      nickname: claims.name ?? null,
      avatarUrl: claims.picture ?? null,
      // 확인되지 않은 메일 주소는 다른 사람 것일 수 있어 받지 않습니다
      email: claims.email_verified ? (claims.email ?? null) : null,
    };
  }

  private async exchange(code: string, codeVerifier: string, redirectUri: string): Promise<string> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
      // 안드로이드 클라이언트는 secret 이 없는 공개 클라이언트입니다.
      // 웹 클라이언트 ID 를 쓰는 설정이면 여기에 secret 이 필요합니다
      ...(env.GOOGLE_CLIENT_SECRET ? { client_secret: env.GOOGLE_CLIENT_SECRET } : {}),
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
      this.logger.error(`구글 토큰 교환 실패: ${String(error)}`);
      throw appError(HttpStatus.BAD_GATEWAY, 'GOOGLE_UNAVAILABLE', '구글 서버에 연결하지 못했습니다');
    }

    const token = (await response.json().catch(() => ({}))) as TokenResponse;
    if (!response.ok || !token.id_token) {
      // 코드가 이미 쓰였거나, redirect_uri 가 등록된 것과 다르거나, code_verifier 가 안 맞는 경우
      this.logger.warn(`구글 토큰 교환 거부 ${response.status}: ${token.error ?? ''} ${token.error_description ?? ''}`);
      throw appError(HttpStatus.UNAUTHORIZED, 'GOOGLE_CODE_INVALID', '구글 로그인에 실패했습니다');
    }
    return token.id_token;
  }
}

/** id_token 가운데 토막이 내용입니다 (서명은 위 설명대로 확인하지 않습니다) */
function decodeClaims(idToken: string): IdTokenClaims | null {
  const payload = idToken.split('.')[1];
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as IdTokenClaims;
  } catch {
    return null;
  }
}
