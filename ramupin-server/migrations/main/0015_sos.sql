-- SOS (WBS 7.9 / 8.3 / 9.3 / 10.8)
--
-- 흐름: 앱에서 10초 카운트다운 -> 10초 녹음 -> 위치·녹음 전송
--       지정한 수신인에게 1차 전송. 지정한 사람이 없으면 회사(모니터링)가 받습니다 (WBS 9.3)

-- 안전 설정. 지금까지 앱 목업에만 있던 것을 서버로 옮깁니다
CREATE TABLE member.safety_settings (
  user_id     uuid PRIMARY KEY REFERENCES member.users(id) ON DELETE CASCADE,
  sos_enabled boolean NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- SOS 를 받을 사람. 친구를 직접 고르거나 그룹방 전체를 고를 수 있습니다
CREATE TABLE member.sos_recipients (
  user_id   uuid NOT NULL REFERENCES member.users(id) ON DELETE CASCADE,
  -- 'friend' = 친구 한 명 / 'group' = 그룹방 전체
  kind      text NOT NULL CHECK (kind IN ('friend', 'group')),
  target_id uuid NOT NULL,
  PRIMARY KEY (user_id, kind, target_id)
);

CREATE TABLE member.sos_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES member.users(id) ON DELETE CASCADE,

  -- 버튼을 누른 시각 (카운트다운 시작). 서버 도착 시각과 다릅니다
  started_at    timestamptz NOT NULL,
  latitude      double precision,
  longitude     double precision,
  altitude      double precision,
  place_name    text,
  place_address text,

  -- 녹음 파일. 사진·동영상과 같은 저장소를 씁니다 (media.assets)
  audio_asset_id uuid REFERENCES media.assets(id) ON DELETE SET NULL,

  -- sent = 발송됨 / cancelled = 본인이 취소 / resolved = 상황 종료
  status        text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'cancelled', 'resolved')),
  -- 받은 사람 수. 0 이면 회사가 받았다는 뜻입니다 (to_monitoring)
  recipient_count int NOT NULL DEFAULT 0,
  -- 지정 수신인이 없어 회사(모니터링 사이트)가 받은 건 (WBS 9.3)
  to_monitoring boolean NOT NULL DEFAULT false,

  created_at    timestamptz NOT NULL DEFAULT now(),
  cancelled_at  timestamptz,
  resolved_at   timestamptz,
  -- 모니터링 사이트에서 사람이 확인한 시각
  acknowledged_at timestamptz
);

-- 모니터링 목록: 아직 안 끝난 것을 최근 순으로
CREATE INDEX sos_events_open_idx ON member.sos_events (created_at DESC) WHERE status = 'sent';
CREATE INDEX sos_events_user_idx ON member.sos_events (user_id, created_at DESC);

-- 누가 이 SOS 를 받았는지. 받은 사람만 상세를 볼 수 있습니다
CREATE TABLE member.sos_deliveries (
  sos_id            uuid NOT NULL REFERENCES member.sos_events(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES member.users(id) ON DELETE CASCADE,
  read_at           timestamptz,
  PRIMARY KEY (sos_id, recipient_user_id)
);

CREATE INDEX sos_deliveries_recipient_idx ON member.sos_deliveries (recipient_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON member.safety_settings, member.sos_recipients, member.sos_events, member.sos_deliveries
  TO app_main;
