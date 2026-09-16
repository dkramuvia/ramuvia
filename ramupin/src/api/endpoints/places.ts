import { apiClient } from '../client';
import { isLive } from '@/config/env';
import type { LatLng, SharedPlace } from '@/types/models';

/**
 * 주소·장소 (서버 → 네이버 지도 REST).
 * 기기 내장 변환은 건물 이름이 거의 안 나와서, 서버가 있으면 서버 결과를 씁니다.
 */
export const placesApi = {
  async reverse(coordinate: LatLng): Promise<SharedPlace | null> {
    if (!isLive('places')) return null;
    const { data } = await apiClient.get<{ address: string; placeName?: string }>('/places/reverse', { params: coordinate });
    return { ...coordinate, address: data.address, placeName: data.placeName };
  },
};
