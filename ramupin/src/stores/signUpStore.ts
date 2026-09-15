import { create } from 'zustand';

import type { Gender } from '@/types/models';

/** 가입 흐름(프로필 → 휴대폰 인증 → 약관 → 권한 → 1인 가구) 동안 입력값 보관 */
interface SignUpState {
  nickname: string;
  gender: Gender | null;
  birthDate: string;
  phone: string;
  agreedTerms: string[];
  set: (patch: Partial<Omit<SignUpState, 'set' | 'reset'>>) => void;
  reset: () => void;
}

const initial = { nickname: '', gender: null, birthDate: '', phone: '', agreedTerms: [] };

export const useSignUpStore = create<SignUpState>((set) => ({
  ...initial,
  set: (patch) => set(patch),
  reset: () => set(initial),
}));
