-- 위치 수집·전송 주기를 정책값으로 (09-18 대표 결정)
--
--   수집 15초 / 전송 1분. 나중에 관리자 페이지에서 등급별로 바꿉니다 (WBS 2.1: 수치 하드코딩 금지)
--
--   gpsIntervalStillSec  : 머무는 중 수집 주기
--   gpsIntervalMovingSec : 이동 중 수집 주기 (이미 있음)
--   uploadIntervalSec    : 모아서 서버로 보내는 주기. 수집과 분리해 서버 요청 수를 줄입니다

UPDATE config.plan_policies
SET policy = policy || '{"gpsIntervalStillSec":15,"uploadIntervalSec":60}'::jsonb
WHERE NOT (policy ? 'gpsIntervalStillSec');
