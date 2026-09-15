import { apiClient, mockResponse } from '../client';
import { mockMe } from '../mock/data';
import { env } from '@/config/env';
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

/**
 * TODO(5단계, 가입·로그인은 마지막): 소셜 SDK 로 받은 토큰을 서버에 보내 검증
 * 목업 인증번호는 123456
 */
export const authApi = {
  async socialLogin(provider: SocialProvider, providerToken: string): Promise<AuthResult> {
    if (env.useMock) {
      return mockResponse({ accessToken: `mock-${provider}`, refreshToken: 'mock', user: mockMe, isNewUser: true });
    }
    const { data } = await apiClient.post<AuthResult>(`/auth/${provider}`, { token: providerToken });
    return data;
  },

  async checkNickname(nickname: string): Promise<{ available: boolean }> {
    if (env.useMock) return mockResponse({ available: nickname !== '중복' });
    const { data } = await apiClient.get('/users/nickname/check', { params: { nickname } });
    return data;
  },

  /** WBS 3.7: 서버가 이미 가입한 번호인지 확인 (중복 가입 방지) */
  async requestSmsCode(phone: string): Promise<{ expiresInSec: number; alreadyRegistered: boolean }> {
    if (env.useMock) return mockResponse({ expiresInSec: 120, alreadyRegistered: false });
    const { data } = await apiClient.post('/auth/sms', { phone });
    return data;
  },

  async verifySmsCode(phone: string, code: string): Promise<{ verified: boolean }> {
    if (env.useMock) return mockResponse({ verified: code === '123456' });
    const { data } = await apiClient.post('/auth/sms/verify', { phone, code });
    return data;
  },

  /** 가입 정보 저장 (프로필·약관·1인 가구) */
  async completeSignUp(input: SignUpProfile & { phone: string; agreedTerms: string[]; singleHousehold: boolean }): Promise<User> {
    if (env.useMock) {
      Object.assign(mockMe, { nickname: input.nickname, gender: input.gender, birthDate: input.birthDate, singleHouseholdMode: input.singleHousehold });
      return mockResponse({ ...mockMe });
    }
    const { data } = await apiClient.post<User>('/auth/sign-up', input);
    return data;
  },
};
