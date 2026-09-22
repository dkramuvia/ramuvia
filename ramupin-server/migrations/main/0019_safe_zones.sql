-- 안심장소(지오펜스)와 진입·이탈 알림 (WBS 8.8, 9.4)
--
-- 판정은 서버에서 합니다. 알림을 받는 사람이 본인이 아니라 친구라서,
-- 폰이 혼자 알아차려 봐야 결국 서버를 거쳐야 하기 때문입니다.
-- 폰은 대신 "안심장소 근처에 왔다" 를 알아차려 수집을 촘촘하게 바꿉니다 (GPS 보고서 2-1 2번).

CREATE TABLE member.safe_zones (
  id         uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  user_id    uuid NOT NULL REFERENCES member.users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  address    text NOT NULL DEFAULT '',
  latitude   double precision NOT NULL,
  longitude  double precision NOT NULL,
  -- 너무 작으면 위치 오차(실내 3~8m, 실외 10~30m)로 들락거림이 반복됩니다
  radius_m   int NOT NULL CHECK (radius_m BETWEEN 50 AND 5000),
  enabled    boolean NOT NULL DEFAULT true,

  -- 지금 이 안에 있는지. 진입·이탈은 "달라졌을 때"만 알리므로 직전 상태가 있어야 합니다
  inside       boolean NOT NULL DEFAULT false,
  inside_since timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 위치가 들어올 때마다 "이 사람의 켜진 안심장소" 를 읽습니다. 가장 잦은 조회입니다
CREATE INDEX safe_zones_user_idx ON member.safe_zones (user_id) WHERE enabled;

-- 이 장소를 드나들 때 알림을 받을 친구. 등급별 인원 제한은 geofenceAlertLimit
CREATE TABLE member.safe_zone_recipients (
  zone_id   uuid NOT NULL REFERENCES member.safe_zones(id) ON DELETE CASCADE,
  friend_id uuid NOT NULL REFERENCES member.users(id) ON DELETE CASCADE,
  PRIMARY KEY (zone_id, friend_id)
);

-- 진입·이탈 기록. 알림을 보낸 근거라 위치 요약 대상에서 제외합니다 (docs/decision-data-retention.md)
CREATE TABLE member.safe_zone_events (
  id          uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  zone_id     uuid NOT NULL REFERENCES member.safe_zones(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES member.users(id) ON DELETE CASCADE,
  -- enter = 들어옴 / leave = 나감
  kind        text NOT NULL CHECK (kind IN ('enter', 'leave')),
  -- 폰이 그 위치를 잰 시각. 서버 도착 시각과 다릅니다 (모아서 보내므로 최대 1분 차이)
  occurred_at timestamptz NOT NULL,
  latitude    double precision NOT NULL,
  longitude   double precision NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX safe_zone_events_user_idx ON member.safe_zone_events (user_id, occurred_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON member.safe_zones, member.safe_zone_recipients, member.safe_zone_events
  TO app_main;
