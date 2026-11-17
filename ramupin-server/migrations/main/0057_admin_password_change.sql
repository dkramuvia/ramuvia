-- 관제센터에서 관리자가 자기 비밀번호를 바꿀 수 있게 (11-17)
-- 접근기록에 남길 구분 추가: 비밀번호 변경 · 비밀번호 변경 실패(지금 비밀번호 틀림)
ALTER TABLE config.admin_access_logs DROP CONSTRAINT IF EXISTS admin_access_logs_action_check;
ALTER TABLE config.admin_access_logs ADD CONSTRAINT admin_access_logs_action_check CHECK (
  action IN ('login', 'login_failed', 'login_locked', 'logout', 'otp_failed', 'account_locked', 'otp_enrolled', 'otp_reset', 'unlocked',
             'password_changed', 'password_change_failed')
);
