import { useEffect } from 'react';
import { AppState } from 'react-native';

import { usePlan } from '@/features/policy/usePlan';
import { DEFAULT_SNAPSHOT } from '@/features/policy/policySnapshot';
import { enqueueLocation, flushIfDue, flushLocationOutbox } from './uploader';
import type { MyLocation } from './useMyLocation';

/** 보낼 때가 됐는지 확인하는 간격(초). 실제 전송 주기는 정책값(uploadIntervalSec)입니다 */
const TICK_SEC = 10;

/**
 * 화면이 받은 내 위치를 서버로 보냅니다 (포그라운드).
 *
 * 쌓는 간격과 보내는 간격은 서버 정책을 따릅니다 (09-18 대표 결정: 15초 확인 / 60초 전송).
 * 백그라운드 수집(backgroundTask)과 같은 대기열·같은 규칙을 씁니다.
 */
export function useLocationUpload(location: MyLocation | null) {
  const { policy } = usePlan();
  const movingSec = policy?.gpsIntervalMovingSec ?? DEFAULT_SNAPSHOT.gpsIntervalMovingSec;
  const stillSec = policy?.gpsIntervalStillSec ?? DEFAULT_SNAPSHOT.gpsIntervalStillSec;
  const uploadSec = policy?.uploadIntervalSec ?? DEFAULT_SNAPSHOT.uploadIntervalSec;

  useEffect(() => {
    if (!location) return;
    // 걷는 속도(3km/h) 이상이면 이동 중으로 봅니다
    const gapSec = (location.speedKmh ?? 0) >= 3 ? movingSec : stillSec;
    enqueueLocation(location, gapSec)
      .then(() => flushIfDue(uploadSec))
      .catch((error) => console.warn('[location] 대기열 저장 실패', String(error)));
  }, [location, movingSec, stillSec, uploadSec]);

  useEffect(() => {
    const timer = setInterval(() => void flushIfDue(uploadSec), TICK_SEC * 1000);
    // 앱으로 돌아왔을 때는 기다리지 않고 바로 보냅니다 (사용자가 지도를 보고 있음)
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void flushLocationOutbox();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [uploadSec]);
}
