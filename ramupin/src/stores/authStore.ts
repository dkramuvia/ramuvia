import { create } from 'zustand';

import { mockMe } from '@/api/mock/data';
import { env, isLive } from '@/config/env';
import type { User } from '@/types/models';

/** 로그인이 끊긴 이유 (사용자에게 안내 팝업) */
export type SessionEndReason = 'replaced' | 'revoked' | 'expired';

interface AuthState {
  accessToken: string | null;
  user: User | null;
  /** 약관, 휴대폰 인증, 권한 안내까지 끝났는지 */
  onboardingDone: boolean;
  /** 다른 기기에서 쓰던 계정이라 문자 인증을 기다리는 중 */
  pendingDeviceVerification: { challengeId: string } | null;
  sessionEnded: SessionEndReason | null;
  signIn: (accessToken: string, user: User) => void;
  updateUser: (patch: Partial<User>) => void;
  completeOnboarding: () => void;
  signOut: (reason?: SessionEndReason) => void;
  setPendingDeviceVerification: (pending: { challengeId: string } | null) => void;
  clearSessionEnded: () => void;
}

// 개발 중 로그인 건너뛰기: 서버 연결(auth)이 꺼져 있으면 목업 사용자로 바로 시작합니다.
// 서버 연결이 켜져 있으면 로그아웃 상태로 시작해 useDevServerSession 이 서버에 로그인합니다.
const devSignedIn =
  env.devSkipAuth && !isLive('auth')
    ? { accessToken: 'dev-token', user: mockMe, onboardingDone: true }
    : { accessToken: null, user: null, onboardingDone: false };

export const useAuthStore = create<AuthState>((set) => ({
  ...devSignedIn,
  pendingDeviceVerification: null,
  sessionEnded: null,
  signIn: (accessToken, user) => set({ accessToken, user, pendingDeviceVerification: null, sessionEnded: null }),
  updateUser: (patch) => set((s) => (s.user ? { user: { ...s.user, ...patch } } : s)),
  completeOnboarding: () => set({ onboardingDone: true }),
  signOut: (reason) => set({ accessToken: null, user: null, onboardingDone: false, sessionEnded: reason ?? null }),
  setPendingDeviceVerification: (pending) => set({ pendingDeviceVerification: pending }),
  clearSessionEnded: () => set({ sessionEnded: null }),
}));

export const selectIsSignedIn = (s: AuthState) => s.accessToken !== null && s.onboardingDone;

/**
 * 이 ID 가 나인지.
 * 서버 연결 전환 기간에는 채팅·그룹 같은 목업 데이터가 목업 ID(26467878)를 쓰므로 둘 다 나로 봅니다.
 * TODO: 모든 기능이 서버로 옮겨지면 user.id 비교만 남기기
 */
export function isMeId(id: string | undefined, user: User | null = useAuthStore.getState().user): boolean {
  if (!id || !user) return false;
  return id === user.id || id === mockMe.id;
}

export function useIsMe() {
  const user = useAuthStore((s) => s.user);
  return (id: string | undefined) => isMeId(id, user);
}
