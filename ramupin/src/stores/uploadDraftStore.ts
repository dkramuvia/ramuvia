import { create } from 'zustand';

import type { MediaAsset, SharedPlace } from '@/types/models';

/** 갤러리 업로드: 사진 선택 → 그룹방 지정·위치 추가 → 공유 사이에 유지되는 임시 값 */
interface UploadDraftState {
  media: MediaAsset[];
  groupId: string | null;
  place: SharedPlace | null;
  setMedia: (media: MediaAsset[]) => void;
  setGroupId: (groupId: string | null) => void;
  setPlace: (place: SharedPlace | null) => void;
  reset: () => void;
}

export const useUploadDraftStore = create<UploadDraftState>((set) => ({
  media: [],
  groupId: null,
  place: null,
  setMedia: (media) => set({ media }),
  setGroupId: (groupId) => set({ groupId }),
  setPlace: (place) => set({ place }),
  reset: () => set({ media: [], groupId: null, place: null }),
}));
