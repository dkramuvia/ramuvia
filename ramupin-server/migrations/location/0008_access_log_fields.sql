-- 위치정보 이용·제공사실 확인자료 보강 (위치정보사업 신고 [첨부 2], 위치정보법)
--
-- 서식 항목: 대상 · 취득경로 · 제공서비스 · 제공받는자 · 이용일시
--  - 대상       subject_user_id (화면에는 8자리 사용자 ID)
--  - 취득경로   source  ← 새로 추가: 위치를 보낸 앱 (android / ios)
--  - 제공서비스 purpose (friend_list / journey / nearby / sos / geofence / monitoring)
--  - 제공받는자 viewer_user_id, 또는 관제센터 직원이 본 경우 viewer_admin_id ← 새로 추가
--  - 이용일시   accessed_at
--
-- 법으로 보관해야 하는 기록이라 앱 계정은 고치거나 지울 수 없게 막습니다 (위·변조 방지).

ALTER TABLE location.location_access_logs ADD COLUMN IF NOT EXISTS source text;
-- 본 DB 의 config.admin_users.id (DB 가 달라 외래키는 걸지 않습니다)
ALTER TABLE location.location_access_logs ADD COLUMN IF NOT EXISTS viewer_admin_id uuid;

CREATE INDEX IF NOT EXISTS location_access_logs_time_idx ON location.location_access_logs (accessed_at DESC);

-- "위치를 전송받을 때마다" 기록은 위치 이력의 받은 시각(received_at)입니다. 관리자 화면에서 최근 순으로 봅니다
CREATE INDEX IF NOT EXISTS location_points_received_idx ON location.location_points (received_at DESC);

REVOKE UPDATE, DELETE, TRUNCATE ON location.location_access_logs FROM app_location;
