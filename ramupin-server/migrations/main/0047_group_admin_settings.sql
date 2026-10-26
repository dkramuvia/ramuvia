-- 그룹 멤버 관리·그룹 설정 (보완 화면 설계 4.19·4.20)
--
--   역할: 방장 = 모든 권한 / 관리자 = 초대·내보내기(방장 제외) / 멤버 = 보기·사진·대화
--   그룹 설정: 멤버 초대·사진 올리기를 "방장·관리자만" 으로 막을 수 있고, 그룹 기본 위치 공개(정확/흐림)를 둡니다
--   그룹 최대 인원은 방장 등급 정책(groupMemberLimit)을 따릅니다

ALTER TABLE social.group_members DROP CONSTRAINT group_members_role_check;
ALTER TABLE social.group_members ADD CONSTRAINT group_members_role_check CHECK (role IN ('owner', 'admin', 'member'));

ALTER TABLE social.groups
  -- 'all' = 멤버 누구나 / 'admins' = 방장·관리자만
  ADD COLUMN invite_permission  text NOT NULL DEFAULT 'all' CHECK (invite_permission IN ('all', 'admins')),
  ADD COLUMN photo_permission   text NOT NULL DEFAULT 'all' CHECK (photo_permission IN ('all', 'admins')),
  -- 친구별 설정이 없는 멤버에게 쓰는 기본 위치 공개 (친구별 설정이 있으면 그쪽이 우선)
  ADD COLUMN default_share_level text NOT NULL DEFAULT 'exact' CHECK (default_share_level IN ('exact', 'blurred'));

-- 그룹 최대 인원 (지금까지 서버에 50명 고정). 등급별 값은 확정 전이라 모두 50 으로 두고 관리자 화면에서 바꿉니다
UPDATE config.plan_policies
SET policy = policy || '{"groupMemberLimit":50}'::jsonb,
    updated_at = now()
WHERE NOT (policy ? 'groupMemberLimit');
