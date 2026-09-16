import { useEffect } from 'react';
import { AppState } from 'react-native';

import { usePlan } from '@/features/policy/usePlan';
import { enqueueLocation, flushLocationOutbox } from './uploader';
import type { MyLocation } from './useMyLocation';

/** 전송 주기 (초): 대기열에 쌓인 점을 모아서 보냅니다 */
const FLUSH_INTERVAL_SEC = 30;
const DEFAULT_GPS_INTERVAL_SEC = 20;

/**
 * 화면이 받은 내 위치를 서버로 보냅니다 (포그라운드).
 * 저장 간격은 등급 정책(gpsIntervalMovingSec)을 따릅니다.
 */
export function useLocationUpload(location: MyLocation | null) {
  const { policy } = usePlan();
  const intervalSec = policy?.gpsIntervalMovingSec ?? DEFAULT_GPS_INTERVAL_SEC;

  useEffect(() => {
    if (!location) return;
    enqueueLocation(location, intervalSec)
      .then((queued) => {
        // 포그라운드에서는 쌓자마자 보내고, 실패한 점은 주기 전송·앱 복귀 때 다시 보냅니다
        // TODO(배터리): 백그라운드 수집 단계에서 모아 보내기로 조정
        if (queued) return flushLocationOutbox();
      })
      .catch((error) => console.warn('[location] 대기열 저장 실패', String(error)));
  }, [location, intervalSec]);

  useEffect(() => {
    const timer = setInterval(() => void flushLocationOutbox(), FLUSH_INTERVAL_SEC * 1000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void flushLocationOutbox();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);
}
