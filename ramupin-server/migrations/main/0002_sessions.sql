-- 기기 1대 로그인 (대표 요청): 한 계정은 한 기기에서만 로그인 상태를 유지합니다.
-- 새 기기에서 로그인하면 휴대폰 문자 인증을 다시 받고, 이전 기기의 세션은 끊깁니다.

-- 기기: 앱 설치 단위(installation_id)로 구분합니다. 앱을 지웠다 다시 깔면 새 기기로 봅니다.
ALTER TABLE member.devices
  ADD COLUMN installation_id text NOT NULL,
  -- 로그인 성공 때 서버가 발급해 앱이 보안 저장소에 보관하는 기기 키의 해시.
  -- 설치 ID 만으로는 같은 기기임을 증명할 수 없어서(ID 를 알면 흉내 가능) 이 키까지 맞아야 문자 인증을 건너뜀
  ADD COLUMN device_key_hash text,
  ADD COLUMN model           text,
  ADD COLUMN os_version      text,
  ADD COLUMN created_at      timestamptz NOT NULL DEFAULT now(),
  -- 문자 인증(가입 또는 새 기기 인증)을 통과한 시각
  ADD COLUMN verified_at     timestamptz,
  ADD COLUMN last_login_at   timestamptz;

ALTER TABLE member.devices DROP CONSTRAINT devices_user_id_push_token_key;
ALTER TABLE member.devices ADD CONSTRAINT devices_user_installation_uq UNIQUE (user_id, installation_id);

CREATE TABLE member.sessions (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     uuid NOT NULL REFERENCES member.users (id) ON DELETE CASCADE,
  device_id                   uuid NOT NULL REFERENCES member.devices (id) ON DELETE CASCADE,
  -- 로그인 방법: dev, kakao, naver, google, apple, x, facebook
  auth_method                 text NOT NULL,
  -- refresh token 은 원문을 저장하지 않고 SHA-256 해시만 저장
  refresh_token_hash          text NOT NULL,
  -- 직전 refresh token (응답 유실로 앱이 같은 토큰을 다시 보내는 경우 잠깐 허용, 그 뒤엔 탈취로 판단)
  previous_refresh_token_hash text,
  refreshed_at                timestamptz NOT NULL DEFAULT now(),
  expires_at                  timestamptz NOT NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  revoked_at                  timestamptz,
  revoke_reason               text CHECK (revoke_reason IN ('logout', 'replaced', 'reused', 'admin', 'withdrawn'))
);

-- ★ 사용자당 끊기지 않은 세션은 1개만 (동시에 두 기기가 로그인해도 DB 가 막음)
CREATE UNIQUE INDEX sessions_one_active_per_user ON member.sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX sessions_user_created ON member.sessions (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON member.sessions TO app_main;
