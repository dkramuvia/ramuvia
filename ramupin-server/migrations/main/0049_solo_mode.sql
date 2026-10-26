-- 1인 가구 안심 모드 (보완 화면 설계 4.2, 수정 반영본 C4)
--
--   친구가 없는 1인 가구가 위급할 때 받을 기관 연락처(주민센터·복지관 등)를 사용자가 직접 적습니다.
--   SOS·움직임 없음·배터리 10% 이하 때만 라무핀 서버가 그 번호로 문자를 보냅니다 (평소 위치는 보내지 않음).
--   친구를 추가해도 안심 모드는 유지됩니다 (예전 "가디언에서 친구 추가 시 해제" 규칙 폐기).

CREATE TABLE member.solo_settings (
  user_id          uuid PRIMARY KEY REFERENCES member.users(id) ON DELETE CASCADE,
  -- 움직임이 없으면 알릴 시간 (12 / 24 / 48)
  inactivity_hours smallint NOT NULL DEFAULT 24 CHECK (inactivity_hours IN (12, 24, 48)),
  -- [필수] 위 정보를 연계 기관에 제공하는 데 동의한 시각
  consented_at     timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- 기관 연락처. 번호는 회원 번호와 같은 방식으로 암호화합니다 (common/phone.ts)
CREATE TABLE member.solo_agencies (
  id              uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  user_id         uuid NOT NULL REFERENCES member.users(id) ON DELETE CASCADE,
  name            text NOT NULL,
  phone_encrypted bytea NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX solo_agencies_user_idx ON member.solo_agencies (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON member.solo_settings, member.solo_agencies TO app_main;
