-- 신고 · 차단 (보완 화면 설계 4.11)
--
--   글·사진을 주고받는 앱은 신고·차단이 스토어 심사 필수 항목입니다.
--   차단하면 바로 양방향 위치 공유와 대화가 끊기고, 상대에게 알리지 않습니다.
--   신고는 운영자 검토 대기열(이 표)로 갑니다. 관리자 화면은 아직 정하지 않았습니다.

CREATE TABLE social.blocks (
  blocker_id uuid NOT NULL REFERENCES member.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES member.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

-- "이 사람이 나를 막았나" 를 반대 방향으로도 찾습니다
CREATE INDEX blocks_blocked_idx ON social.blocks (blocked_id);

CREATE TABLE member.reports (
  id             uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  reporter_id    uuid NOT NULL REFERENCES member.users(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES member.users(id) ON DELETE CASCADE,
  -- message = 채팅 메시지 / photo = 갤러리 사진 / profile = 친구 프로필·친구 요청
  target_kind    text NOT NULL CHECK (target_kind IN ('message', 'photo', 'profile')),
  -- 메시지·사진 id. 원본이 지워져도 신고는 남깁니다 (외래키 없음)
  target_id      uuid,
  -- spam = 스팸·사기 / harassment = 괴롭힘·위협 / tracking = 원치 않는 위치 추적 / inappropriate = 부적절한 사진·콘텐츠 / other = 기타
  reason         text NOT NULL CHECK (reason IN ('spam', 'harassment', 'tracking', 'inappropriate', 'other')),
  detail         text,
  -- 신고 당시 메시지 글 (원본이 지워져도 검토할 수 있게)
  preview        text,
  -- pending = 검토 대기 / reviewed = 검토함 / dismissed = 문제 없음
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  reviewed_at    timestamptz
);

CREATE INDEX reports_pending_idx ON member.reports (created_at DESC) WHERE status = 'pending';

GRANT SELECT, INSERT, UPDATE, DELETE ON social.blocks, member.reports TO app_main;
