-- 친구별 맞춤 알림 설정 (피그마 2026-09-28 "친구별 맞춤 알림 설정")
--
-- 지금까지 알림은 전체 켜기/끄기뿐이었습니다. 친구가 여러 명이면
-- "어머니 것만 받고 싶다" 를 할 수 없었습니다. 친구마다 따로 정합니다.
--
-- 여기서 owner_id 는 **알림을 받는 사람**(나), friend_id 는 **소식의 주인공**입니다.
-- 방향을 헷갈리면 남의 설정으로 알림이 갑니다.

CREATE TABLE social.friend_alert_settings (
  owner_id   uuid NOT NULL REFERENCES member.users(id) ON DELETE CASCADE,
  friend_id  uuid NOT NULL REFERENCES member.users(id) ON DELETE CASCADE,

  -- 배터리가 곧 방전될 때
  battery    boolean NOT NULL DEFAULT true,
  -- 안심존에 들어가거나 나갈 때
  safe_zone  boolean NOT NULL DEFAULT true,
  -- 제한 속도를 넘어 이동 중일 때 (2단계 기능)
  speeding   boolean NOT NULL DEFAULT false,
  -- 내 반경 1km 안으로 들어왔을 때
  nearby     boolean NOT NULL DEFAULT false,

  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, friend_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON social.friend_alert_settings TO app_main;
