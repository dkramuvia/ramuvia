import { create } from 'zustand';

import type { MediaAsset, SharedPlace } from '@/types/models';

/** 갤러리 업로드: 사진 선택 → 그룹방 지정·위치 추가 → 공유 사이에 유지되는 임시 값 */
interface UploadDraftState {
  media: MediaAsset[];
  /** 고른 그룹방들 (피그마 583: 여러 개) */
  groupIds: string[];
  place: SharedPlace | null;
  setMedia: (media: MediaAsset[]) => void;
  toggleGroup: (groupId: string) => void;
  setPlace: (place: SharedPlace | null) => void;
  reset: () => void;
}

export const useUploadDraftStore = create<UploadDraftState>((set) => ({
  media: [],
  groupIds: [],
  place: null,
  setMedia: (media) => set({ media }),
  toggleGroup: (groupId) => set((s) => ({ groupIds: s.groupIds.includes(groupId) ? s.groupIds.filter((id) => id !== groupId) : [...s.groupIds, groupId] })),
  setPlace: (place) => set({ place }),
  reset: () => set({ media: [], groupIds: [], place: null }),
}));
