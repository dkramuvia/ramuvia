-- 앱이 서버 정책을 다시 받는 주기 (10-13 대표님)
--
--   앱이 닫혀 있어도 백그라운드 위치 수집이 이 주기마다 정책을 다시 받습니다.
--   관리자가 GPS 주기 등을 바꾸면 이 시간 안에 모든 폰에 적용됩니다. 기본 5분.

UPDATE config.plan_policies
SET policy = policy || '{"policyRefreshSec":300}'::jsonb,
    updated_at = now()
WHERE NOT (policy ? 'policyRefreshSec');
