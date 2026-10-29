import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import type { LatLng } from '@/types/models';

export interface MyLocation extends LatLng {
  /** 수평 오차 반경 (m) */
  accuracy: number | null;
  /** 이동 속도 (km/h) */
  speedKmh: number | null;
  heading: number | null;
  altitude: number | null;
  altitudeAccuracy: number | null;
  timestamp: number;
}

export type LocationPermission = 'undetermined' | 'granted' | 'denied';

/**
 * 화면이 떠 있는 동안만 내 위치를 추적합니다 (포그라운드).
 * TODO(2·6단계): 백그라운드 수집·서버 전송은 GPS 수집 모듈에서 처리하고, 이 훅은 화면 표시용으로만 사용
 * TODO(정책): 갱신 거리/주기는 서버 정책값으로 교체 (WBS 2.1)
 */
export function useMyLocation() {
  const [permission, setPermission] = useState<LocationPermission>('undetermined');
  const [location, setLocation] = useState<MyLocation | null>(null);

  useEffect(() => {
    let subscription: Location.LocationSubscription | undefined;
    let cancelled = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== Location.PermissionStatus.GRANTED) {
        setPermission('denied');
        return;
      }
      setPermission('granted');

      // 마지막으로 알려진 위치를 먼저 보여주고, 이후 실시간으로 갱신
      // 오래됐거나 오차가 큰 마지막 위치는 버립니다. 엉뚱한 곳에 먼저 떴다가 나중에 옮겨 갔습니다 (대표 리포트 66)
      const last = await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS, requiredAccuracy: LAST_KNOWN_MAX_ACCURACY_M });
      if (last && !cancelled && isFreshEnough(last)) setLocation(toMyLocation(last));

      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 10, timeInterval: 5000 },
        (position) => setLocation(toMyLocation(position)),
      );
      if (cancelled) subscription.remove();
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, []);

  return { permission, location };
}

const LAST_KNOWN_MAX_AGE_MS = 2 * 60_000;
const LAST_KNOWN_MAX_ACCURACY_M = 100;

/** 기기마다 maxAge·requiredAccuracy 를 지키지 않을 수 있어 한 번 더 봅니다 */
function isFreshEnough({ coords, timestamp }: Location.LocationObject) {
  return Date.now() - timestamp <= LAST_KNOWN_MAX_AGE_MS && (coords.accuracy == null || coords.accuracy <= LAST_KNOWN_MAX_ACCURACY_M);
}

function toMyLocation({ coords, timestamp }: Location.LocationObject): MyLocation {
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: coords.accuracy,
    speedKmh: coords.speed != null && coords.speed >= 0 ? coords.speed * 3.6 : null,
    heading: coords.heading,
    altitude: coords.altitude,
    altitudeAccuracy: coords.altitudeAccuracy,
    timestamp,
  };
}
