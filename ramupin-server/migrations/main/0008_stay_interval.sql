-- 머무는 중 수집 주기를 1분으로 (09-18 협의)
--
--   이상징후 판정 기준은 전부 시간 단위입니다 (가장 짧은 "신호 두절"이 30분, 나머지는 12·24·48시간).
--   그래서 가만히 계실 때 15초로 찍어도 판정이 좋아지지 않고, 하루 22시간이 그 구간이라 비용만 커집니다.
--   이동 중에는 보호자 실시간 추적·과속 경고가 있어 촘촘하게 둡니다.
--
--   gpsIntervalStillSec  15 -> 60
--   gpsIntervalMovingSec 무료 20 -> 15 (유료 10 유지)

UPDATE config.plan_policies
SET policy = policy || '{"gpsIntervalStillSec":60}'::jsonb,
    updated_at = now();

UPDATE config.plan_policies
SET policy = policy || '{"gpsIntervalMovingSec":15}'::jsonb,
    updated_at = now()
WHERE (policy->>'gpsIntervalMovingSec')::int > 15;
