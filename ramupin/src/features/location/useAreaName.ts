import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';

import type { LatLng } from '@/types/models';

import { distanceM } from './geo';
export { distanceM };

// 이 거리(m) 이상 움직였을 때만 주소를 다시 조회합니다 (역지오코딩 호출 절약)
const REFRESH_DISTANCE_M = 300;

/** 지도 상단 제목용 지역명: "서울시 강남구", "경기도 오산시" */
export function useAreaName(coordinate: LatLng | null) {
  const [name, setName] = useState<string | null>(null);
  // 성공한 조회 위치만 기록합니다. 앱 시작 직후 기기 Geocoder 가 실패하면 다음 위치 갱신 때 다시 시도
  const lastResolved = useRef<LatLng | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  // 조회하는 동안 들어온 마지막 좌표. 지도가 움직이는 도중의 지점을 조회하는 사이 도착한 최종 위치를 건너뛰면
  // 제목이 중간 지점 이름으로 남았습니다 (10-27 안심존 추가 화면: 강남 기본값 → 가산동 이동 중 "관악구")
  const latest = useRef<LatLng | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  useEffect(() => {
    latest.current = coordinate;
    if (!coordinate || inFlight.current) return;
    if (lastResolved.current && distanceM(lastResolved.current, coordinate) < REFRESH_DISTANCE_M) return;

    inFlight.current = true;
    // 기기 내장 Geocoder 사용 (무료). 결과가 부족하면 5단계에서 서버/Google Geocoding 으로 교체
    // 위치가 계속 갱신되므로 조회 중 좌표가 바뀌어도 결과는 버리지 않습니다
    Location.reverseGeocodeAsync(coordinate)
      .then(([address]) => {
        if (!mounted.current || !address) return;
        const formatted = formatAreaName(address);
        if (formatted) {
          lastResolved.current = coordinate;
          setName(formatted);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        inFlight.current = false;
        // 조회 중에 멀리 옮겨졌으면 마지막 좌표로 한 번 더
        if (mounted.current && latest.current && distanceM(latest.current, coordinate) >= REFRESH_DISTANCE_M) setRetry((n) => n + 1);
      });
  }, [coordinate, retry]);

  return name;
}

/** Android Geocoder 는 구 단위가 subregion 이 아니라 district 로 오는 경우가 많습니다 (예: region 서울특별시, district 금천구) */
export function formatAreaName(address: Location.LocationGeocodedAddress): string {
  const region = (address.region ?? '').replace(/특별시|광역시|특별자치시/, '시');
  const local = address.subregion ?? address.city ?? address.district ?? '';
  return [region, local].filter(Boolean).join(' ');
}
