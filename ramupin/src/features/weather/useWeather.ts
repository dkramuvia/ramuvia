import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/api/client';
import { isLive } from '@/config/env';
import type { LatLng } from '@/types/models';

/**
 * 지금 있는 곳의 날씨 (피그마 지도 메인, 2026-09-28판의 `13.9°C`).
 *
 * 서버를 거칩니다 — 날씨 제공처를 바꿀 때 앱을 새로 배포하지 않아도 되고,
 * 캐시가 서버에 한 벌만 있으면 되기 때문입니다 (서버 weather.module.ts 설명 참고).
 *
 * **없어도 되는 정보입니다.** 못 가져오면 배지를 그리지 않고 넘어갑니다.
 * 날씨 때문에 지도가 비거나 오류가 뜨는 일은 없어야 합니다.
 */

export type WeatherCondition = 'clear' | 'cloudy' | 'rain' | 'snow' | 'fog' | 'storm';

export interface Weather {
  temperature: number;
  condition: WeatherCondition;
}

/** 좌표가 이만큼 움직여야 다시 물어봅니다 (약 1km). 걸어다닐 때마다 부르지 않게 */
const GRID = 100;
/** 날씨는 15분마다 갱신됩니다. 10분이면 충분합니다 */
const STALE_MS = 10 * 60_000;

export function useWeather(location: LatLng | null) {
  const lat = location ? Math.round(location.latitude * GRID) / GRID : null;
  const lng = location ? Math.round(location.longitude * GRID) / GRID : null;

  return useQuery({
    queryKey: ['weather', lat, lng],
    enabled: lat != null && lng != null && isLive('weather'),
    staleTime: STALE_MS,
    // 못 가져와도 다시 조르지 않습니다. 다음 갱신 때 자연히 다시 시도합니다
    retry: false,
    queryFn: async (): Promise<Weather | null> => {
      const { data } = await apiClient.get<Weather | null>('/weather', { params: { latitude: lat, longitude: lng } });
      return data;
    },
  });
}
