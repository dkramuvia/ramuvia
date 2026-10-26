import { create } from 'zustand';

/** 이번 로그인으로 끊긴 이전 기기 (보완 4.21) */
export interface ReplacedDevice {
  model: string | null;
  platform: string;
}

/**
 * 다른 기기에서 쓰던 계정으로 로그인했을 때 "새 휴대폰에서 로그인했어요" 화면을 한 번 보여 주려고
 * 로그인 응답의 이전 기기를 잠깐 들고 있습니다. 화면에서 [이 휴대폰으로 계속] 을 누르면 비웁니다.
 */
export const useDeviceRestoreStore = create<{ replaced: ReplacedDevice | null; set: (d: ReplacedDevice | null) => void }>((set) => ({
  replaced: null,
  set: (replaced) => set({ replaced }),
}));
