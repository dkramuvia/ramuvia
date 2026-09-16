import { apiClient, mockResponse } from '../client';
import { mockMe } from '../mock/data';
import { isLive } from '@/config/env';
import type { Gender, User } from '@/types/models';

/** WBS 3.8: Google, Apple, X, Facebook, Instagram, Naver, Kakao (Instagram 은 API 종료로 1차 제외 검토, wbs-check §2-6) */
export type SocialProvider = 'google' | 'x' | 'facebook' | 'apple' | 'instagram' | 'kakao' | 'naver';

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: User;
  isNewUser: boolean;
}

export interface SignUpProfile {
  nickname: string;
  gender: Gender;
  birthDate: string; // YYYY-MM-DD
}

export interface SmsRequestResult {
  /** 이미 가입에 사용된 번호 (문자를 보내지 않음) */
  alreadyRegistered: boolean;
  codeExpiresInSec: number;
  resendAfterSec: number;
  phoneMasked: string | null;
}

/** 서버에 보내는 기기 정보 (기기 1대 로그인 규칙) */
export interface DeviceInput {
  installationId: string;
  platform: 'android' | 'ios';
  model?: string | null;
  osVersion?: string | null;
  appVersion?: string | null;
  /** 이전 로그인 때 서버가 준 기기 키. 이게 맞아야 같은 기기로 인정돼 문자 인증을 건너뜀 */
  deviceKey?: string | null;
}

export interface SessionTokens {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

/** 로그인 결과: 바로 로그인 / 다른 기기라 문자 인증 필요 / 처음이라 가입 필요 */
export type LoginResult =
  | ({ status: 'ok'; deviceKey: string } & SessionTokens)
  | { status: 'device_verification_required'; challengeId: string; expiresInSec: number }
  | { status: 'sign_up_required'; signUpToken: string; suggestedNickname: string | null; expiresInSec: number };

/** 서버 인증 오류 코드 (ramupin-server src/auth/auth-error.ts) */
export type AuthErrorCode =
  | 'TOKEN_MISSING'
  | 'TOKEN_INVALID'
  | 'TOKEN_EXPIRED'
  | 'SESSION_REPLACED'
  | 'SESSION_REVOKED'
  | 'REFRESH_INVALID'
  | 'REFRESH_EXPIRED'
  | 'ACCOUNT_INACTIVE'
  | 'CHALLENGE_EXPIRED'
  | 'CODE_NOT_SENT'
  | 'CODE_EXPIRED'
  | 'CODE_INVALID'
  | 'CODE_ATTEMPTS_EXCEEDED'
  | 'SMS_TOO_SOON'
  | 'SMS_LIMIT'
  | 'PHONE_NOT_REGISTERED'
  | 'PHONE_ALREADY_REGISTERED'
  | 'PHONE_NOT_VERIFIED'
  | 'SIGN_UP_TOKEN_INVALID'
  | 'NICKNAME_TAKEN'
  | 'KAKAO_TOKEN_INVALID'
  | 'KAKAO_UNAVAILABLE';

export interface AuthErrorBody {
  code?: AuthErrorCode;
  message?: string;
  retryAfterSec?: number;
  remainingAttempts?: number;
}

/** axios 오류에서 서버 인증 오류 본문 꺼내기 */
export function authErrorOf(error: unknown): AuthErrorBody | undefined {
  return (error as { response?: { data?: AuthErrorBody } }).response?.data;
}

/**
 * TODO(5단계, 가입·로그인은 마지막): 소셜 SDK 로 받은 토큰을 서버에 보내 검증
 * 목업 인증번호는 123456
 */
export const authApi = {
  /** 개발용 로그인: 서버 시드 사용자의 8자리 ID (서버 DEV_LOGIN_ENABLED=true 일 때만) */
  async devLogin(publicId: string, device: DeviceInput): Promise<LoginResult> {
    const { data } = await apiClient.post<LoginResult>('/auth/dev-login', { publicId, device });
    return data;
  },

  /** 새 기기 인증: 가입한 휴대폰으로 인증번호 발송 (재발송 포함) */
  async sendDeviceCode(challengeId: string): Promise<{ codeExpiresInSec: number; resendAfterSec: number; phoneMasked: string | null }> {
    const { data } = await apiClient.post('/auth/device-verification/send', { challengeId });
    return data;
  },

  /** 새 기기 인증: 맞으면 이전 기기 로그인이 끊기고 이 기기로 로그인 */
  async verifyDeviceCode(challengeId: string, code: string): Promise<LoginResult> {
    const { data } = await apiClient.post<LoginResult>('/auth/device-verification/verify', { challengeId, code });
    return data;
  },

  async refresh(refreshToken: string): Promise<SessionTokens> {
    const { data } = await apiClient.post<SessionTokens>('/auth/refresh', { refreshToken });
    return data;
  },

  async logout(): Promise<void> {
    await apiClient.post('/auth/logout');
  },

  /** 카카오 로그인: 카카오 SDK 로 받은 토큰을 서버가 확인 */
  async kakaoLogin(accessToken: string, device: DeviceInput): Promise<LoginResult> {
    const { data } = await apiClient.post<LoginResult>('/auth/kakao', { accessToken, device });
    return data;
  },

  /** TODO(로그인 단계): 네이버·구글·애플 등 나머지 소셜. 서버는 같은 흐름을 씁니다 */
  async socialLogin(provider: SocialProvider, providerToken: string): Promise<AuthResult> {
    if (!isLive('auth')) {
      return mockResponse({ accessToken: `mock-${provider}`, refreshToken: 'mock', user: mockMe, isNewUser: true });
    }
    const { data } = await apiClient.post<AuthResult>(`/auth/${provider}`, { token: providerToken });
    return data;
  },

  async checkNickname(nickname: string): Promise<{ available: boolean }> {
    if (!isLive('auth')) return mockResponse({ available: nickname !== '중복' });
    const { data } = await apiClient.get<{ available: boolean }>('/auth/nickname-check', { params: { nickname } });
    return data;
  },

  /** 가입 중 휴대폰 인증번호 발송. 이미 가입된 번호면 alreadyRegistered (WBS 3.7) */
  async requestSignUpCode(signUpToken: string, phone: string): Promise<SmsRequestResult> {
    if (!isLive('auth')) return mockResponse({ alreadyRegistered: false, codeExpiresInSec: 180, resendAfterSec: 30, phoneMasked: null });
    const { data } = await apiClient.post<SmsRequestResult>('/auth/sign-up/sms', { signUpToken, phone });
    return data;
  },

  async verifySignUpCode(signUpToken: string, code: string): Promise<{ verified: boolean }> {
    if (!isLive('auth')) return mockResponse({ verified: code === '123456' });
    const { data } = await apiClient.post<{ verified: boolean }>('/auth/sign-up/sms/verify', { signUpToken, code });
    return data;
  },

  /** 가입 완료 → 회원 생성 + 로그인 토큰 */
  async completeSignUp(
    input: SignUpProfile & { signUpToken: string; agreedTerms: string[]; singleHousehold: boolean; device: DeviceInput },
  ): Promise<LoginResult> {
    if (!isLive('auth')) {
      Object.assign(mockMe, { nickname: input.nickname, gender: input.gender, birthDate: input.birthDate, singleHouseholdMode: input.singleHousehold });
      return mockResponse({ status: 'ok', deviceKey: 'mock', accessToken: 'dev-token', accessTokenExpiresAt: '', refreshToken: 'mock', refreshTokenExpiresAt: '' });
    }
    const { data } = await apiClient.post<LoginResult>('/auth/sign-up', input);
    return data;
  },
};
