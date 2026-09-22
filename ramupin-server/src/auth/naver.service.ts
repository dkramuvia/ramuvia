import { HttpStatus, Injectable, Logger } from '@nestjs/common';

import { appError } from '../common/app-error.js';
import { env } from '../config/env.js';

/**
 * 네이버 로그인 (WBS 3.6, 3.8).
 *
 * **왜 필요한가**: 노인 무료 등급은 나이로 정해지는데(WBS 3.7), 지금은 가입 화면에서
 * 본인이 적은 생년월일을 그대로 믿습니다. 아무나 1950년생이라고 적으면 유료 등급을
 * 공짜로 받습니다. 네이버·카카오가 확인해 준 출생연도를 받아 오면 그 구멍이 막힙니다.
 *
 * **방식은 X 와 같습니다.** 앱은 인가 코드만 받아 오고, 토큰 교환은 서버가 합니다.
 * 다만 네이버는 공개 클라이언트(PKCE)를 지원하지 않아 **client secret 이 필요**하고,
 * 그래서 교환은 **반드시 서버에서만** 합니다. 앱에는 Client ID 만 들어갑니다.
 */

interface TokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface NaverMeResponse {
  resultcode: string;
  message: string;
  response?: {
    id: string;
    nickname?: string;
    profile_image?: string;
    /** 실명. **쓰지 않습니다** — 위 nickname 설명 참고 */
    name?: string;
    /** 'YYYY' — "출생연도" 항목에 동의했을 때만 옵니다 */
    birthyear?: string;
    /** 'MM-DD' — "생일" 항목에 동의했을 때만 옵니다 */
    birthday?: string;
    /** 'M' | 'F' | 'U' */
    gender?: string;
  };
}

export interface NaverUser {
  providerUserId: string;
  nickname: string | null;
  avatarUrl: string | null;
  /** 네이버가 확인해 준 출생연도. 동의하지 않았으면 null */
  birthYear: number | null;
  gender: 'male' | 'female' | null;
}

const TOKEN_URL = 'https://nid.naver.com/oauth2.0/token';
const ME_URL = 'https://openapi.naver.com/v1/nid/me';
const TIMEOUT_MS = 8000;

@Injectable()
export class NaverService {
  private readonly logger = new Logger(NaverService.name);

  get enabled(): boolean {
    return !!env.NAVER_LOGIN_CLIENT_ID && !!env.NAVER_LOGIN_CLIENT_SECRET;
  }

  async verify(code: string, state: string, redirectUri: string): Promise<NaverUser> {
    if (!this.enabled) {
      throw appError(HttpStatus.SERVICE_UNAVAILABLE, 'NAVER_DISABLED', '네이버 로그인이 아직 준비되지 않았습니다');
    }

    const accessToken = await this.exchange(code, state, redirectUri);
    const me = await this.fetchMe(accessToken);
    const user = me.response;
    if (me.resultcode !== '00' || !user?.id) {
      this.logger.warn(`네이버 프로필 응답 이상: ${me.resultcode} ${me.message}`);
      throw appError(HttpStatus.UNAUTHORIZED, 'NAVER_TOKEN_INVALID', '네이버 계정 정보를 가져오지 못했습니다');
    }

    const birthYear = user.birthyear && /^\d{4}$/.test(user.birthyear) ? Number(user.birthyear) : null;
    return {
      providerUserId: user.id,
      // 별명만 씁니다. 네이버 "회원이름"은 실명이라, 닉네임 칸에 미리 채우면
      // 그대로 넘기는 분들의 실명이 친구에게 보이는 공개 이름이 됩니다
      nickname: user.nickname ?? null,
      avatarUrl: user.profile_image ?? null,
      birthYear,
      gender: user.gender === 'M' ? 'male' : user.gender === 'F' ? 'female' : null,
    };
  }

  /**
   * 인가 코드를 access token 으로 바꿉니다.
   *
   * `state` 를 그대로 넘깁니다. 앱이 만든 임의의 값이 돌아온 것과 같아야 하는데,
   * 그 비교는 앱에서 이미 했습니다 (다른 사이트가 우리 로그인 흐름에 코드를 끼워 넣는 것을 막는 장치).
   */
  private async exchange(code: string, state: string, redirectUri: string): Promise<string> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: env.NAVER_LOGIN_CLIENT_ID,
      client_secret: env.NAVER_LOGIN_CLIENT_SECRET,
      code,
      state,
      redirect_uri: redirectUri,
    });

    let response: Response;
    try {
      response = await fetch(`${TOKEN_URL}?${params.toString()}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (error) {
      this.logger.error(`네이버 토큰 교환 실패: ${String(error)}`);
      throw appError(HttpStatus.BAD_GATEWAY, 'NAVER_UNAVAILABLE', '네이버 서버에 연결하지 못했습니다');
    }

    // 네이버는 오류일 때도 200 으로 주고 본문에 error 를 담습니다. 상태 코드만 보면 안 됩니다
    const token = (await response.json().catch(() => ({}))) as TokenResponse;
    if (!response.ok || !token.access_token) {
      this.logger.warn(`네이버 토큰 교환 거부: ${token.error ?? response.status} ${token.error_description ?? ''}`);
      throw appError(HttpStatus.UNAUTHORIZED, 'NAVER_CODE_INVALID', '네이버 로그인에 실패했습니다');
    }
    return token.access_token;
  }

  private async fetchMe(accessToken: string): Promise<NaverMeResponse> {
    let response: Response;
    try {
      response = await fetch(ME_URL, {
        headers: { authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.error(`네이버 프로필 조회 실패: ${String(error)}`);
      throw appError(HttpStatus.BAD_GATEWAY, 'NAVER_UNAVAILABLE', '네이버 서버에 연결하지 못했습니다');
    }
    if (!response.ok) {
      this.logger.warn(`네이버 프로필 응답 ${response.status}`);
      throw appError(HttpStatus.UNAUTHORIZED, 'NAVER_TOKEN_INVALID', '네이버 계정 정보를 가져오지 못했습니다');
    }
    return (await response.json()) as NaverMeResponse;
  }
}
