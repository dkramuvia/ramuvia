-- GPS 보고서(0921) 반영 1·2 (09-21)
--
--   1. 저배터리 기준을 정책값으로. 보고서 2-1 은 20% 인데 앱에 15% 가 박혀 있었습니다
--   2. 유료 등급 이동 주기 10초 -> 15초. 보고서 2-1 의 "이동 중 15~30초" 범위 밖이었습니다

UPDATE config.plan_policies
SET policy = policy || '{"lowBatteryPercent":20}'::jsonb,
    updated_at = now()
WHERE NOT (policy ? 'lowBatteryPercent');

UPDATE config.plan_policies
SET policy = policy || '{"gpsIntervalMovingSec":15}'::jsonb,
    updated_at = now()
WHERE (policy->>'gpsIntervalMovingSec')::int < 15;
