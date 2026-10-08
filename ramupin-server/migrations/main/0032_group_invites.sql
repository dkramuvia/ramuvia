-- 그룹방 초대 링크 (피그마 사람들 605 '초대 링크', 친구 요청 플로우 738 '그룹방 초대', 2026-10-08)
--
-- 채팅방에서 '초대 링크'를 누르면 서버가 주소를 하나 발급합니다. 받은 사람이 주소를 열면
-- 앱이 열리고 '그룹방 초대' 화면에서 수락하면 들어옵니다.
--
-- 사진 공유 링크(0028)와 같은 규칙입니다 — 무효화를 따로 청소하지 않고, 열 때마다
--   - 만료됐는지 / 직접 껐는지
--   - **만든 사람이 아직 그 그룹에 있는지**
-- 를 봅니다. 나간 사람이 만든 링크는 저절로 막힙니다.

CREATE TABLE social.group_invites (
  -- 주소에 들어가는 값. 맞혀서 열 수 없을 만큼 길어야 합니다
  token      text PRIMARY KEY,
  group_id   uuid NOT NULL REFERENCES social.groups(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES member.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 같은 방에서 "내가 만든 살아 있는 링크" 를 다시 찾습니다 (누를 때마다 새로 만들지 않게)
CREATE INDEX group_invites_group_idx ON social.group_invites (group_id, created_by) WHERE revoked_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON social.group_invites TO app_main;
