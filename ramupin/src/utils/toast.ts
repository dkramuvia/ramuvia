import { create } from 'zustand';

/**
 * 짧은 안내 ("ID를 복사했어요" 등).
 *
 * 예전에는 안드로이드 시스템 토스트(ToastAndroid)를 썼는데, 대표 리포트 4차에서 S23 에서 복사·중복확인 뒤
 * 아무 안내가 안 보였습니다 (삼성 폰은 시스템 토스트를 막거나 클립보드 창에 가려지는 경우가 있음).
 * 이제 앱이 직접 화면 아래에 그립니다 (ToastHost, app/_layout.tsx). 아이폰도 같은 모양입니다.
 */
interface ToastState {
  message: string | null;
  /** 같은 문구를 연달아 띄워도 다시 보이게 */
  seq: number;
}

export const useToastStore = create<ToastState>(() => ({ message: null, seq: 0 }));

export function showToast(message: string) {
  useToastStore.setState((s) => ({ message, seq: s.seq + 1 }));
}

export function hideToast() {
  useToastStore.setState({ message: null });
}
