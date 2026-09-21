-- 사진·동영상 공유 (WBS 5.6 ~ 6.1)
--
-- 파일 자체는 저장소(개발 MinIO / 운영 S3)에 두고, 여기에는 "어디에 무엇이 있는지"만 남깁니다.
-- DB 에 파일을 넣으면 백업과 조회가 같이 무거워집니다.

CREATE SCHEMA IF NOT EXISTS media;

CREATE TABLE media.assets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL REFERENCES member.users(id) ON DELETE CASCADE,
  -- 저장소 안의 경로. 예: u/<userId>/2026/09/<uuid>.jpg
  object_key  text NOT NULL UNIQUE,
  kind        text NOT NULL CHECK (kind IN ('image', 'video')),
  content_type text NOT NULL,
  bytes       bigint NOT NULL CHECK (bytes > 0),
  width       int,
  height      int,
  -- 동영상 길이(초)
  duration_sec int,
  -- 업로드 주소만 받고 실제로 안 올린 것이 남지 않게. 완료 확인이 되면 값이 들어갑니다
  uploaded_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX media_assets_owner_idx ON media.assets (owner_id, created_at DESC);
-- 올리다 만 것 정리용
CREATE INDEX media_assets_pending_idx ON media.assets (created_at) WHERE uploaded_at IS NULL;

CREATE TABLE media.posts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    uuid NOT NULL REFERENCES social.groups(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES member.users(id) ON DELETE CASCADE,
  -- 같이 올린 장소 (WBS 5.8). 장소명은 특정될 때만 있고 주소는 항상 있습니다
  place_name    text,
  place_address text,
  latitude    double precision,
  longitude   double precision,
  -- 긴급 공지는 목록 맨 위에 큰 글씨로 (WBS 5.9). 제목이 있으면 긴급 공지입니다
  emergency_title   text,
  emergency_message text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE INDEX media_posts_group_idx ON media.posts (group_id, created_at DESC) WHERE deleted_at IS NULL;
-- 긴급 공지 먼저 보여 주기
CREATE INDEX media_posts_emergency_idx ON media.posts (group_id, created_at DESC) WHERE deleted_at IS NULL AND emergency_title IS NOT NULL;
CREATE INDEX media_posts_author_idx ON media.posts (author_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE media.post_assets (
  post_id  uuid NOT NULL REFERENCES media.posts(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES media.assets(id) ON DELETE CASCADE,
  position smallint NOT NULL,
  PRIMARY KEY (post_id, asset_id)
);

GRANT USAGE ON SCHEMA media TO app_main;
GRANT SELECT, INSERT, UPDATE, DELETE ON media.assets, media.posts, media.post_assets TO app_main;
