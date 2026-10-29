import { useEffect } from 'react';
import { AppState } from 'react-native';

import { usePlan } from '@/features/policy/usePlan';
import { DEFAULT_SNAPSHOT } from '@/features/policy/policySnapshot';
import { enqueueLocation, flushIfDue, flushLocationOutbox } from './uploader';
import { isSosActive } from './sosMode';
import type { MyLocation } from './useMyLocation';
import { isWatched } from './watchMode';

/** 보낼 때가 됐는지 확인하는 간격(초). 실제 전송 주기는 정책값(uploadIntervalSec)입니다 */
const TICK_SEC = 10;

/**
 * 누가 내 지도를 보고 있거나 SOS 중이면 기다리지 않고 바로(0초) 보냅니다.
 * 대표 리포트 49: 포그라운드는 늘 정책 주기(60초)만 기다려, 상대 화면에서 내 위치·배터리가 늦게 바뀌고
 * 보낼 위치가 9개씩 쌓여 보였습니다. 백그라운드 수집(backgroundTask)과 같은 규칙입니다.
 */
async function dueSec(uploadSec: number): Promise<number> {
  const [watched, sos] = await Promise.all([isWatched(), isSosActive()]);
  return watched || sos ? 0 : uploadSec;
}

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
  const moveDistanceM = policy?.moveDistanceM ?? DEFAULT_SNAPSHOT.moveDistanceM;

  useEffect(() => {
    if (!location) return;
    // 걷는 속도(3km/h) 이상이면 이동 중으로 봅니다
    const moving = (location.speedKmh ?? 0) >= 3;
    const rule =
      moving && moveDistanceM > 0
        ? { minGapSec: movingSec, minDistanceM: moveDistanceM, forceAfterSec: stillSec }
        : { minGapSec: moving ? movingSec : stillSec };
    enqueueLocation(location, rule)
      .then(() => dueSec(uploadSec))
      .then((sec) => flushIfDue(sec))
      .catch((error) => console.warn('[location] 대기열 저장 실패', String(error)));
  }, [location, movingSec, stillSec, uploadSec, moveDistanceM]);

  useEffect(() => {
    const timer = setInterval(() => {
      void dueSec(uploadSec)
        .then((sec) => flushIfDue(sec))
        .catch(() => undefined);
    }, TICK_SEC * 1000);
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
