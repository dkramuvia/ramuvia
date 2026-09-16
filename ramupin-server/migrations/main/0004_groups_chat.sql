-- 그룹방과 채팅 (WBS 7)
-- 1:1 대화도 멤버가 2명인 그룹방입니다. 그룹 id = 채팅방 id (앱 types/models.ts 주석과 동일)

CREATE TABLE social.groups (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  owner_id            uuid NOT NULL REFERENCES member.users (id) ON DELETE CASCADE,
  -- 1:1 방은 친구 두 명이 만들어지는 방 (WBS 7.4). 목록·설정 화면에서 구분에 사용
  is_direct           boolean NOT NULL DEFAULT false,
  -- 그룹 프리미엄 (WBS 7.1)
  is_premium          boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE social.group_members (
  group_id            uuid NOT NULL REFERENCES social.groups (id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES member.users (id) ON DELETE CASCADE,
  role                text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  -- 그룹 안에서 내 위치 공유를 잠시 끔 (WBS 7.2)
  location_paused     boolean NOT NULL DEFAULT false,
  joined_at           timestamptz NOT NULL DEFAULT now(),
  -- 마지막으로 읽은 시각 (안 읽은 메시지 수 계산)
  last_read_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX group_members_user ON social.group_members (user_id);

-- 1:1 방은 두 사람당 하나만: 정렬한 두 uuid 로 유일 키
CREATE TABLE social.direct_rooms (
  user_a              uuid NOT NULL REFERENCES member.users (id) ON DELETE CASCADE,
  user_b              uuid NOT NULL REFERENCES member.users (id) ON DELETE CASCADE,
  group_id            uuid NOT NULL REFERENCES social.groups (id) ON DELETE CASCADE,
  PRIMARY KEY (user_a, user_b),
  CHECK (user_a < user_b)
);

CREATE SCHEMA IF NOT EXISTS chat;

CREATE TABLE chat.messages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id             uuid NOT NULL REFERENCES social.groups (id) ON DELETE CASCADE,
  -- 시스템 메시지(입장·나감 안내)는 보낸 사람이 없을 수 있음
  sender_id           uuid REFERENCES member.users (id) ON DELETE SET NULL,
  type                text NOT NULL CHECK (type IN ('text', 'location', 'system')),
  text                text,
  -- 위치 공유 메시지: { latitude, longitude, address, placeName }
  place               jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (type <> 'location' OR place IS NOT NULL),
  CHECK (type = 'location' OR text IS NOT NULL)
);
-- 방의 최근 메시지부터 읽기
CREATE INDEX messages_room_time ON chat.messages (room_id, created_at DESC);

GRANT USAGE ON SCHEMA chat TO app_main;
GRANT SELECT, INSERT, UPDATE, DELETE ON social.groups, social.group_members, social.direct_rooms, chat.messages TO app_main;
