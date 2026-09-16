import { apiClient } from '../client';

/** 서버 POST /locations 의 점 하나 (ramupin-server src/location/location.module.ts pointSchema 와 같은 모양) */
export interface LocationPointPayload {
  latitude: number;
  longitude: number;
  /** ISO 8601 (시간대 포함) */
  measuredAt: string;
  altitude?: number | null;
  accuracy?: number | null;
  altitudeAccuracy?: number | null;
  /** m/s */
  speed?: number | null;
  heading?: number | null;
  provider?: string | null;
  battery?: number | null;
  state?: 'sos' | 'geofence' | 'low_battery' | 'moving' | 'still' | null;
}

export const locationsApi = {
  /** 한 번에 최대 500개 */
  async upload(points: LocationPointPayload[]): Promise<{ received: number; saved: number }> {
    const { data } = await apiClient.post<{ received: number; saved: number }>('/locations', { points });
    return data;
  },
};
