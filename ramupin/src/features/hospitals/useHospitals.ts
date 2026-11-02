import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { apiClient } from '@/api/client';
import { isLive } from '@/config/env';
import type { MapArea } from '@/features/map/types';

/**
 * 지도에 보이는 영역의 병원 (11-02 대표님 확정: 전국 모든 병원을 이름과 함께).
 *
 * 서버가 전국 목록을 들고 있고(hospitals.module.ts), 여기서는 보이는 영역만 묻습니다.
 * 영역 안이 많으면 서버가 "120곳" 묶음으로만 줍니다. 확대하면 병원 하나하나가 옵니다.
 */

export interface Hospital {
  id: string;
  name: string;
  /** 종별 이름 (종합병원·의원·치과의원 ...) */
  kind: string | null;
  address: string | null;
  phone: string | null;
  latitude: number;
  longitude: number;
}

export interface HospitalCluster {
  latitude: number;
  longitude: number;
  count: number;
}

export interface HospitalsInArea {
  hospitals: Hospital[];
  clusters: HospitalCluster[];
}

/**
 * 조금 움직일 때마다 묻지 않게 영역을 격자에 맞춰 반올림합니다.
 * 격자는 화면 높이의 1/8 이라, 확대 정도와 관계없이 화면이 1/8 쯤 움직이면 다시 묻습니다
 */
function snap(area: MapArea): MapArea {
  const step = Math.max((area.north - area.south) / 8, 0.0005);
  return {
    south: Math.floor(area.south / step) * step,
    west: Math.floor(area.west / step) * step,
    north: Math.ceil(area.north / step) * step,
    east: Math.ceil(area.east / step) * step,
  };
}

export function useHospitals(area: MapArea | null, enabled: boolean) {
  const box = area ? snap(area) : null;
  return useQuery({
    queryKey: ['hospitals', box?.south.toFixed(5), box?.west.toFixed(5), box?.north.toFixed(5), box?.east.toFixed(5)],
    // 나라 전체가 보일 만큼 축소했으면 묻지 않습니다 (서버도 거절)
    enabled: enabled && !!box && box.north - box.south <= 5 && box.east - box.west <= 5 && isLive('places'),
    staleTime: 60 * 60_000,
    // 지도를 옮기는 동안 앞 결과를 그대로 보여 줘야 마커가 깜빡이지 않습니다
    placeholderData: keepPreviousData,
    retry: false,
    queryFn: async (): Promise<HospitalsInArea> => {
      const { data } = await apiClient.get<HospitalsInArea>('/hospitals', { params: box });
      return data;
    },
  });
}
