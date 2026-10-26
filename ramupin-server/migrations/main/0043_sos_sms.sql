-- SOS 문자를 서버가 자동 발송 (보완 화면 설계 4.4~4.6, 수정 반영본 C1·C6·C8·C9, 10-16·10-26 대표님)
--
--   iPhone 은 앱이 문자를 자동으로 보낼 수 없고, Android 도 Play 가 문자 발송 권한을 거의 허가하지 않습니다.
--   그래서 비회원 연락처에는 라무핀 서버가 문자 업체(알리고)로 보냅니다. 국내 휴대폰 번호만,
--   플래티넘부터(features.sosSms), SOS 한 번에 최대 sosSmsMaxPerEvent 건.
--   폰 인터넷이 끊겨 서버에 닿지 못할 때만 앱이 문자 창을 띄웁니다.

-- 긴급전화(사용자가 직접 등록, 4.6)와 SOS 때 할 일
ALTER TABLE member.safety_settings
  ADD COLUMN emergency_name   text,
  ADD COLUMN emergency_number text,
  -- 비회원 연락처에 문자도 보낼지
  ADD COLUMN sms_enabled      boolean NOT NULL DEFAULT true,
  -- SOS 때 10초 녹음. 녹음에 동의가 필요한 지역에서는 끕니다
  ADD COLUMN record_enabled   boolean NOT NULL DEFAULT true,
  -- 2초 길게 눌러야 SOS 시작 (오작동 방지)
  ADD COLUMN long_press_start boolean NOT NULL DEFAULT true;

-- SOS 를 문자로 받을 비회원 연락처. 번호는 회원 번호와 같은 방식으로 암호화합니다 (common/phone.ts)
CREATE TABLE member.sos_contacts (
  id              uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  user_id         uuid NOT NULL REFERENCES member.users(id) ON DELETE CASCADE,
  name            text NOT NULL,
  phone_encrypted bytea NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sos_contacts_user_idx ON member.sos_contacts (user_id);

-- SOS 문자 한 건. 보낸 사람이 결과 화면에서 "전송됨 / 전송 실패 · 다시 보내기" 를 봅니다 (C8)
CREATE TABLE member.sos_sms_deliveries (
  id              uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  sos_id          uuid NOT NULL REFERENCES member.sos_events(id) ON DELETE CASCADE,
  -- 연락처를 지워도 보낸 기록은 남깁니다
  contact_id      uuid REFERENCES member.sos_contacts(id) ON DELETE SET NULL,
  name            text NOT NULL,
  phone_encrypted bytea NOT NULL,
  -- sending = 보내는 중 / sent = 업체가 받음 / failed = 실패 / skipped = 등급·한도·번호 때문에 안 보냄
  status          text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent', 'failed', 'skipped')),
  reason          text,
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sos_sms_deliveries_sos_idx ON member.sos_sms_deliveries (sos_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON member.sos_contacts, member.sos_sms_deliveries TO app_main;

-- 비회원 문자는 플래티넘부터 (보고서 4.4), 한 번에 최대 5건 (보고서 "새로 정해야 할 것")
UPDATE config.plan_policies
SET policy = jsonb_set(policy, '{features,sosSms}', to_jsonb(plan IN ('platinum', 'trinity')))
             || '{"sosSmsMaxPerEvent":5}'::jsonb,
    updated_at = now();
