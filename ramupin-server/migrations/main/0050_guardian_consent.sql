-- 보호자 동의 (만 14세 미만, 보완 화면 설계 4.1, 수정 반영본 C3)
--
--   위치정보법·개인정보보호법상 만 14세 미만은 법정대리인(보호자) 동의가 있어야 합니다.
--   가입하면 계정은 "대기"(pending_guardian) 로 만들어지고 위치를 모으지 않습니다.
--   보호자 휴대폰으로 동의 링크 문자(알리고)를 보내고, 보호자가 웹 페이지에서 동의하면 active 가 됩니다.
--   24시간 안에 동의가 없으면 입력한 정보를 모두 지웁니다 (계정 삭제).
--   동의 내용을 링크로 보내 동의받는 방식은 개인정보보호법 시행령 제17조의2 의 동의 방법에 해당 (시행 전 법률 검토 권장).

ALTER TABLE member.users DROP CONSTRAINT users_status_check;
ALTER TABLE member.users ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'suspended', 'withdrawn', 'pending_guardian'));

CREATE TABLE member.guardian_consents (
  user_id         uuid PRIMARY KEY REFERENCES member.users(id) ON DELETE CASCADE,
  guardian_name   text NOT NULL,
  phone_encrypted bytea NOT NULL,
  -- [선택] 보호자에게 SOS 자동 연결 (동의하면 보호자 번호를 SOS 문자 연락처로 넣습니다)
  sos_link        boolean NOT NULL DEFAULT false,
  -- 동의 링크 주소에 들어가는 값. 맞혀서 열 수 없을 만큼 깁니다
  token           text NOT NULL UNIQUE,
  requested_at    timestamptz NOT NULL DEFAULT now(),
  resend_count    smallint NOT NULL DEFAULT 0,
  expires_at      timestamptz NOT NULL,
  consented_at    timestamptz,
  -- 동의한 기록 (언제 어디서). 분쟁 때 근거입니다
  consent_ip      text,
  consent_agent   text
);

GRANT SELECT, INSERT, UPDATE, DELETE ON member.guardian_consents TO app_main;
