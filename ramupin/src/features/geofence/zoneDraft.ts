import type { Geofence } from '@/types/models';

/**
 * 안심존 만들기 1단계(위치·이름·반경, 4.16)에서 2단계(알림 대상, 4.17)로 넘기는 초안.
 * 화면 주소에 담기에는 크고(친구 목록), 저장 전이라 서버에도 없어서 잠깐 여기에 둡니다.
 */
export type ZoneDraft = Omit<Geofence, 'id'> & { id?: string };

let draft: ZoneDraft | null = null;

export const zoneDraft = {
  set(next: ZoneDraft) {
    draft = next;
  },
  get(): ZoneDraft | null {
    return draft;
  },
  clear() {
    draft = null;
  },
};
