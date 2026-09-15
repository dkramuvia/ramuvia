import { create } from 'zustand';

import { mockMe } from '@/api/mock/data';
import { env } from '@/config/env';
import type { User } from '@/types/models';

interface AuthState {
  accessToken: string | null;
  user: User | null;
  /** 약관, 휴대폰 인증, 권한 안내까지 끝났는지 */
  onboardingDone: boolean;
  signIn: (accessToken: string, user: User) => void;
  updateUser: (patch: Partial<User>) => void;
  completeOnboarding: () => void;
  signOut: () => void;
}

const devSignedIn = env.devSkipAuth
  ? { accessToken: 'dev-token', user: mockMe, onboardingDone: true }
  : { accessToken: null, user: null, onboardingDone: false };

// TODO(5단계): accessToken/refreshToken 을 expo-secure-store 에 저장하고 앱 시작 시 복원
export const useAuthStore = create<AuthState>((set) => ({
  ...devSignedIn,
  signIn: (accessToken, user) => set({ accessToken, user }),
  updateUser: (patch) => set((s) => (s.user ? { user: { ...s.user, ...patch } } : s)),
  completeOnboarding: () => set({ onboardingDone: true }),
  signOut: () => set({ accessToken: null, user: null, onboardingDone: false }),
}));

export const selectIsSignedIn = (s: AuthState) => s.accessToken !== null && s.onboardingDone;
