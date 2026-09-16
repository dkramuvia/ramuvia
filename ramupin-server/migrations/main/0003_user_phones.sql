-- 전화번호 분리 보관 (2026-09-16 결정)
-- 회원 정보와 같은 줄에 두지 않고 별도 테이블에 두어, 회원 조회 쿼리에 번호가 딸려 나오지 않게 합니다.
-- 원문은 암호화(AES-256-GCM), 중복 가입 확인은 해시(HMAC)로만 합니다.

ALTER TABLE member.users DROP COLUMN phone_hash;
ALTER TABLE member.users DROP COLUMN phone_encrypted;

CREATE TABLE member.user_phones (
  user_id             uuid PRIMARY KEY REFERENCES member.users (id) ON DELETE CASCADE,
  -- 같은 번호로 중복 가입 방지 (WBS 3.7)
  phone_hash          text NOT NULL UNIQUE,
  phone_encrypted     bytea NOT NULL,
  -- 문자 인증을 통과한 시각
  verified_at         timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- 번호 원문을 꺼내 본 기록 (문자 발송, 화면 표시 등). 사고 조사와 감사용
CREATE TABLE member.phone_access_logs (
  id                  bigserial PRIMARY KEY,
  user_id             uuid NOT NULL,
  -- sms_sign_up, sms_device_verify, sms_emergency, mask_display, admin ...
  purpose             text NOT NULL,
  -- 요청한 주체 (사용자 id 또는 system)
  actor               text NOT NULL DEFAULT 'system',
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX phone_access_logs_user_time ON member.phone_access_logs (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON member.user_phones TO app_main;
GRANT SELECT, INSERT ON member.phone_access_logs TO app_main;
GRANT USAGE ON SEQUENCE member.phone_access_logs_id_seq TO app_main;
