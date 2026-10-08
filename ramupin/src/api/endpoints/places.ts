import { apiClient } from '../client';
import { isLive } from '@/config/env';
import type { LatLng, SharedPlace } from '@/types/models';

/**
 * 주소·장소 (서버 → 네이버 지도 REST).
 * 기기 내장 변환은 건물 이름이 거의 안 나와서, 서버가 있으면 서버 결과를 씁니다.
 */
export const placesApi = {
  /**
   * 장소 이름 검색 (피그마 586 '연관 검색어'). 가까운 곳부터.
   * 서버가 꺼져 있으면 null — 그때는 기기 주소 검색으로 대신합니다 (address.ts)
   */
  async search(keyword: string, near?: LatLng | null): Promise<SharedPlace[] | null> {
    if (!isLive('places')) return null;
    const { data } = await apiClient.get<{ address: string; placeName?: string; latitude: number; longitude: number }[]>('/places/search', {
      params: { keyword, ...(near ? { latitude: near.latitude, longitude: near.longitude } : {}) },
    });
    return data;
  },

  async reverse(coordinate: LatLng): Promise<SharedPlace | null> {
    if (!isLive('places')) return null;
    const { data } = await apiClient.get<{ address: string; placeName?: string }>('/places/reverse', { params: coordinate });
    return { ...coordinate, address: data.address, placeName: data.placeName };
  },
};
