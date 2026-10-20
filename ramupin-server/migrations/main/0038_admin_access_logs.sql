-- 관리자 접근기록 (위치정보사업 신고 [첨부 2] "위치정보시스템의 관리자 접근사실 기록")
--
-- 관제센터(관리자 웹)에 누가 언제 어디(IP)서 들어왔는지, 실패한 시도까지 남깁니다.
-- 기록은 덧붙이기만 합니다. 앱 계정은 고치거나 지울 수 없게 막습니다 (위·변조 방지).

CREATE TABLE IF NOT EXISTS config.admin_access_logs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- 없는 아이디로 시도했으면 비어 있습니다. 관리자 계정을 지워도 기록은 남깁니다
  admin_id    uuid REFERENCES config.admin_users(id) ON DELETE SET NULL,
  login_id    text NOT NULL,
  -- login: 로그인 / login_failed: 실패 / login_locked: 실패가 많아 막힘 / logout: 로그아웃
  action      text NOT NULL CHECK (action IN ('login', 'login_failed', 'login_locked', 'logout')),
  ip          text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_access_logs_created_idx ON config.admin_access_logs (created_at DESC);

GRANT SELECT, INSERT ON config.admin_access_logs TO app_main;
REVOKE UPDATE, DELETE, TRUNCATE ON config.admin_access_logs FROM app_main;
