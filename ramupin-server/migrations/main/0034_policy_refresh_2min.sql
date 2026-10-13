-- 설정 확인 주기 기본값 5분 → 2분 (10-13 대표님)
--   관리자가 이미 다른 값으로 바꾼 등급은 그대로 둡니다
UPDATE config.plan_policies
SET policy = policy || '{"policyRefreshSec":120}'::jsonb,
    updated_at = now()
WHERE (policy->>'policyRefreshSec')::int = 300;
