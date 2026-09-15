-- 본 DB (ramupin): 회원·친구·정책
-- 규칙: 위치 DB(ramupin_location) 테이블과 JOIN·외래키 금지. 사용자 ID(uuid)만 주고받습니다.

CREATE SCHEMA IF NOT EXISTS member;
CREATE SCHEMA IF NOT EXISTS social;
CREATE SCHEMA IF NOT EXISTS config;

-- ─────────────── member ───────────────

CREATE TABLE member.users (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 앱에 보이는 8자리 ID (WBS 3.9)
  public_id           text NOT NULL UNIQUE,
  nickname            text NOT NULL UNIQUE,
  gender              text CHECK (gender IN ('male', 'female')),
  birth_date          date,
  -- 전화번호: 원문은 암호화해서 저장, 중복 가입 확인은 해시로 (WBS 3.7)
  phone_hash          text UNIQUE,
  phone_encrypted     bytea,
  avatar_url          text,
  status_message      text,
  plan                text NOT NULL DEFAULT 'basic',
  single_household    boolean NOT NULL DEFAULT false,
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'withdrawn')),
  last_active_at      timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE member.social_accounts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES member.users (id) ON DELETE CASCADE,
  provider            text NOT NULL,
  provider_user_id    text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_user_id)
);

CREATE TABLE member.terms_agreements (
  user_id             uuid NOT NULL REFERENCES member.users (id) ON DELETE CASCADE,
  term_key            text NOT NULL,
  version             text NOT NULL,
  agreed_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, term_key, version)
);

CREATE TABLE member.devices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES member.users (id) ON DELETE CASCADE,
  push_token          text,
  platform            text NOT NULL CHECK (platform IN ('android', 'ios')),
  app_version         text,
  last_seen_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, push_token)
);

-- ─────────────── social ───────────────

CREATE TABLE social.friend_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id        uuid NOT NULL REFERENCES member.users (id) ON DELETE CASCADE,
  to_user_id          uuid NOT NULL REFERENCES member.users (id) ON DELETE CASCADE,
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'canceled')),
  message             text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  responded_at        timestamptz,
  CHECK (from_user_id <> to_user_id)
);
-- 같은 두 사람 사이에 대기 중인 요청은 하나만
CREATE UNIQUE INDEX friend_requests_pending_uq ON social.friend_requests (from_user_id, to_user_id) WHERE status = 'pending';

-- 친구 관계는 양방향 2행으로 저장 (조회를 단순하게)
CREATE TABLE social.friendships (
  user_id             uuid NOT NULL REFERENCES member.users (id) ON DELETE CASCADE,
  friend_id           uuid NOT NULL REFERENCES member.users (id) ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, friend_id),
  CHECK (user_id <> friend_id)
);

-- 내가(owner) 친구에게 공유하는 수준 (WBS 6.8: 기본은 비공개, 기획 확정 전)
CREATE TABLE social.friend_share_settings (
  owner_id            uuid NOT NULL,
  friend_id           uuid NOT NULL,
  location_level      text NOT NULL DEFAULT 'hidden' CHECK (location_level IN ('exact', 'blurred', 'hidden')),
  show_status         boolean NOT NULL DEFAULT false,
  share_route         boolean NOT NULL DEFAULT false,
  share_battery       boolean NOT NULL DEFAULT false,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, friend_id),
  FOREIGN KEY (owner_id, friend_id) REFERENCES social.friendships (user_id, friend_id) ON DELETE CASCADE,
  -- 기획 규칙: 흐림이면 이동경로 공유 불가, 비공개면 전부 불가
  CHECK (location_level <> 'blurred' OR share_route = false),
  CHECK (location_level <> 'hidden' OR (show_status = false AND share_route = false AND share_battery = false))
);

-- ─────────────── config ───────────────

-- 등급별 정책값 (WBS 2.1: 수치 하드코딩 금지, 관리자 웹에서 수정)
CREATE TABLE config.plan_policies (
  plan                text PRIMARY KEY,
  policy              jsonb NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- 관리자가 사용자별로 덮어쓰는 값 (WBS 11.6: 사용자별 전송 주기 등)
CREATE TABLE config.user_policy_overrides (
  user_id             uuid PRIMARY KEY REFERENCES member.users (id) ON DELETE CASCADE,
  policy              jsonb NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

INSERT INTO config.plan_policies (plan, policy) VALUES
  ('basic',    '{"gpsIntervalMovingSec":20,"safeZoneLimit":4,"placeLimit":10,"geofenceAlertLimit":0,"scheduledMessageRecipientLimit":2,"sosRecipientLimit":1,"photoStorageMb":300,"ads":"banner+fullscreen","features":{"premiumMap":false,"trafficWeather":false,"speedingAlert":false,"governmentEmergency":false}}'),
  ('platinum', '{"gpsIntervalMovingSec":10,"safeZoneLimit":20,"placeLimit":50,"geofenceAlertLimit":10,"scheduledMessageRecipientLimit":10,"sosRecipientLimit":10,"photoStorageMb":1024,"ads":"none","features":{"premiumMap":true,"trafficWeather":true,"speedingAlert":true,"governmentEmergency":true}}'),
  ('trinity',  '{"gpsIntervalMovingSec":10,"safeZoneLimit":50,"placeLimit":100,"geofenceAlertLimit":30,"scheduledMessageRecipientLimit":30,"sosRecipientLimit":30,"photoStorageMb":5120,"ads":"none","features":{"premiumMap":true,"trafficWeather":true,"speedingAlert":true,"governmentEmergency":true}}'),
  ('care',     '{"gpsIntervalMovingSec":10,"safeZoneLimit":20,"placeLimit":10,"geofenceAlertLimit":10,"scheduledMessageRecipientLimit":3,"sosRecipientLimit":5,"photoStorageMb":300,"ads":"none","features":{"premiumMap":false,"trafficWeather":true,"speedingAlert":false,"governmentEmergency":true}}'),
  ('guardian', '{"gpsIntervalMovingSec":20,"safeZoneLimit":3,"placeLimit":10,"geofenceAlertLimit":3,"scheduledMessageRecipientLimit":1,"sosRecipientLimit":1,"photoStorageMb":0,"ads":"banner+fullscreen","features":{"premiumMap":false,"trafficWeather":false,"speedingAlert":false,"governmentEmergency":true}}');

-- ─────────────── 앱 계정 권한 ───────────────
-- app_main 은 데이터만 읽고 쓸 수 있고, 테이블 구조는 바꿀 수 없습니다.

GRANT USAGE ON SCHEMA member, social, config TO app_main;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA member, social, config TO app_main;
ALTER DEFAULT PRIVILEGES IN SCHEMA member, social, config GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_main;
