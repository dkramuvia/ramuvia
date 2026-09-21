-- 이동 중 최소 이동 거리 (GPS 보고서 2-2, 09-21)
--
--   이동 중에 신호 대기처럼 길에 서 있으면 같은 자리를 반복해서 쌓게 됩니다.
--   직전 점에서 이만큼 못 움직였으면 건너뜁니다. 보고서 권장 50~100m.
--   0 이면 거리 조건 없이 시간만 봅니다.
--
--   단, 거리 때문에 계속 건너뛰면 서버가 "신호 두절"로 오해하므로
--   머무는 주기(gpsIntervalStillSec)가 지나면 앱이 하나는 반드시 올립니다.

UPDATE config.plan_policies
SET policy = policy || '{"moveDistanceM":75}'::jsonb,
    updated_at = now()
WHERE NOT (policy ? 'moveDistanceM');
