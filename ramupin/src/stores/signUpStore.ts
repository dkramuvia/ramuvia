import { create } from 'zustand';

import type { Gender } from '@/types/models';

/**
 * 가입 흐름(프로필 → 휴대폰 인증 → 약관 → 권한 → 1인 가구) 동안 입력값 보관.
 * signUpToken 은 소셜 로그인 뒤 서버가 준 가입 토큰(30분)으로, 가입 API 마다 함께 보냅니다.
 */
interface SignUpState {
  signUpToken: string;
  nickname: string;
  gender: Gender | null;
  birthDate: string;
  phone: string;
  /** 문자 인증을 통과했는지 */
  phoneVerified: boolean;
  agreedTerms: string[];
  set: (patch: Partial<Omit<SignUpState, 'set' | 'reset'>>) => void;
  reset: () => void;
}

const initial = { signUpToken: '', nickname: '', gender: null, birthDate: '', phone: '', phoneVerified: false, agreedTerms: [] };

export const useSignUpStore = create<SignUpState>((set) => ({
  ...initial,
  set: (patch) => set(patch),
  reset: () => set(initial),
}));
