-- 근처 친구 찾기에 내가 나타날지 (WBS 12.9)
--
-- **기본은 꺼짐입니다.** 이 기능은 아직 친구가 아닌 사람에게 "이 근처에 있다" 를
-- 알려 줍니다. 위치정보법상 **본인 동의 없이 남에게 위치를 알릴 수 없습니다.**
-- 동의를 켠 사람끼리만 서로 보입니다.
--
-- 좌표를 주지는 않습니다. 근처에 있다는 사실과 지역명까지만 나갑니다.
ALTER TABLE member.users
  ADD COLUMN nearby_discoverable boolean NOT NULL DEFAULT false;

-- 근처 찾기는 "켠 사람" 중에서만 훑습니다. 대부분은 꺼져 있을 것이므로 부분 인덱스가 효율적입니다
CREATE INDEX users_nearby_discoverable_idx ON member.users (id) WHERE nearby_discoverable;
