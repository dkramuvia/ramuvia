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
  };
}

export interface KakaoUser {
  providerUserId: string;
  nickname: string | null;
  avatarUrl: string | null;
}

const API = 'https://kapi.kakao.com';
const TIMEOUT_MS = 5000;

/**
 * 카카오 로그인.
 * 앱이 카카오 SDK 로 받은 access token 을 서버가 카카오에 확인합니다.
 * 토큰이 우리 앱(KAKAO_APP_ID)에서 발급된 것인지 반드시 확인해야 합니다 (다른 앱 토큰으로 로그인 방지).
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
    const kakaoProfile = profile?.kakao_account?.profile;
    return {
      providerUserId: String(info.id),
      nickname: kakaoProfile?.nickname ?? null,
      avatarUrl: kakaoProfile?.is_default_image ? null : (kakaoProfile?.profile_image_url ?? null),
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
