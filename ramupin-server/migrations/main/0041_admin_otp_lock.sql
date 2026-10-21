-- 관리자 로그인 강화 (위치정보사업 신고 [첨부 2] 식별 및 인증)
--  - OTP: 인증 앱(Google Authenticator 등)의 6자리 숫자. 비밀값은 암호화해서 둡니다 (admin/admin-otp.ts)
--  - 계정 잠금: 비밀번호·OTP 를 연속 5회 틀리면 30분 잠금 (IP 를 바꿔도 같은 계정이면 잠깁니다)

ALTER TABLE config.admin_users ADD COLUMN IF NOT EXISTS otp_secret_enc bytea;
ALTER TABLE config.admin_users ADD COLUMN IF NOT EXISTS otp_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE config.admin_users ADD COLUMN IF NOT EXISTS failed_count integer NOT NULL DEFAULT 0;
ALTER TABLE config.admin_users ADD COLUMN IF NOT EXISTS locked_until timestamptz;

-- 접근기록에 남길 구분 추가: OTP 실패 · 계정 잠김 · OTP 등록 · OTP 초기화 · 잠금 해제
ALTER TABLE config.admin_access_logs DROP CONSTRAINT IF EXISTS admin_access_logs_action_check;
ALTER TABLE config.admin_access_logs ADD CONSTRAINT admin_access_logs_action_check CHECK (
  action IN ('login', 'login_failed', 'login_locked', 'logout', 'otp_failed', 'account_locked', 'otp_enrolled', 'otp_reset', 'unlocked')
);
