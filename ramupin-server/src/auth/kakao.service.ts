import { HttpStatus, Injectable, Logger } from '@nestjs/common';

import { appError } from '../common/app-error.js';
import { env } from '../config/env.js';

interface TokenInfo {
  id: number;
  expires_in: number;
  app_id: number;
}

interface KakaoProfile {
  id: number;
  kakao_account?: {
    profile?: { nickname?: string; profile_image_url?: string; is_default_image?: boolean };
    /** 'YYYY' — 비즈 앱으로 전환하고 "출생연도" 동의를 받아야 옵니다 (WBS 3.6) */
    birthyear?: string;
    /** 'male' | 'female' */
    gender?: string;
  };
}

export interface KakaoUser {
  providerUserId: string;
  nickname: string | null;
  avatarUrl: string | null;
  /** 카카오가 확인해 준 출생연도. 동의 항목이 없으면 null */
  birthYear: number | null;
  gender: 'male' | 'female' | null;
}

const API = 'https://kapi.kakao.com';
const TIMEOUT_MS = 5000;

/**
 * 카카오 로그인.
 * 앱이 카카오 SDK 로 받은 access token 을 서버가 카카오에 확인합니다.
 * 토큰이 우리 앱(KAKAO_APP_ID)에서 발급된 것인지 반드시 확인해야 합니다 (다른 앱 토큰으로 로그인 방지).
 *
 * 출생연도도 같이 받아 옵니다. 노인 무료 등급이 가입 화면에서 본인이 적은 생년월일로만
 * 정해지면 아무나 1950년생이라고 적어 공짜로 받을 수 있기 때문입니다 (WBS 3.6·3.7).
 * 받으려면 **비즈 앱 전환 + "출생연도" 동의 항목**이 필요합니다 — 없으면 null 로 옵니다.
 */
@Injectable()
export class KakaoService {
  private readonly logger = new Logger(KakaoService.name);

  async verify(accessToken: string): Promise<KakaoUser> {
    const info = await this.call<TokenInfo>('/v1/user/access_token_info', accessToken);
    if (info.app_id !== env.KAKAO_APP_ID) {
      this.logger.warn(`다른 카카오 앱의 토큰 (app_id ${info.app_id})`);
      throw appError(HttpStatus.UNAUTHORIZED, 'KAKAO_TOKEN_INVALID', '카카오 토큰이 올바르지 않습니다');
    }

    // 닉네임·프로필 사진은 사용자가 동의했을 때만 옵니다 (없어도 로그인은 진행)
    const profile = await this.call<KakaoProfile>('/v2/user/me?secure_resource=true', accessToken).catch(() => null);
    const account = profile?.kakao_account;
    const kakaoProfile = account?.profile;
    const birthYear = account?.birthyear && /^\d{4}$/.test(account.birthyear) ? Number(account.birthyear) : null;
    return {
      providerUserId: String(info.id),
      nickname: kakaoProfile?.nickname ?? null,
      avatarUrl: kakaoProfile?.is_default_image ? null : (kakaoProfile?.profile_image_url ?? null),
      birthYear,
      gender: account?.gender === 'male' ? 'male' : account?.gender === 'female' ? 'female' : null,
    };
  }

  private async call<T>(path: string, accessToken: string): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${API}${path}`, {
        headers: { authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.error(`카카오 서버 연결 실패: ${String(error)}`);
      throw appError(HttpStatus.BAD_GATEWAY, 'KAKAO_UNAVAILABLE', '카카오 서버에 연결하지 못했습니다');
    }
    if (response.status === 401) throw appError(HttpStatus.UNAUTHORIZED, 'KAKAO_TOKEN_INVALID', '카카오 로그인이 만료되었습니다');
    if (!response.ok) {
      this.logger.error(`카카오 ${path} → ${response.status} ${await response.text()}`);
      throw appError(HttpStatus.BAD_GATEWAY, 'KAKAO_UNAVAILABLE', '카카오 응답을 처리하지 못했습니다');
    }
    return (await response.json()) as T;
  }
}
