-- 사진 공유 링크 (WBS 6)
--
-- 그룹 밖 사람에게 사진을 보여 주는 주소입니다. 로그인 없이 열립니다.
--
-- **무효화를 따로 청소하지 않습니다.** 열어 볼 때마다
--   - 게시물이 지워졌는지
--   - **만든 사람이 아직 그 그룹에 있는지**
-- 를 봅니다. 그룹에서 나가거나 그룹이 없어지면 링크가 저절로 막힙니다.
-- 그룹이 바뀔 때마다 링크를 찾아 지우는 방식은, 한 군데라도 빠뜨리면
-- 나간 사람이 만든 링크가 계속 열립니다.

CREATE TABLE media.post_shares (
  -- 주소에 들어가는 값. 맞혀서 열 수 없을 만큼 길어야 합니다
  token      text PRIMARY KEY,
  post_id    uuid NOT NULL REFERENCES media.posts(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES member.users(id) ON DELETE CASCADE,
  -- 만료 시각. 사진 주소가 영원히 살아 있으면 그 자체가 위험입니다
  expires_at timestamptz NOT NULL,
  -- 직접 껐으면 그 시각
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 같은 게시물에 대해 "내가 만든 살아 있는 링크" 를 다시 찾습니다 (누를 때마다 새로 만들지 않게)
CREATE INDEX post_shares_post_idx ON media.post_shares (post_id, created_by) WHERE revoked_at IS NULL;
