-- 나이를 소셜에서 확인했는지 (WBS 3.6, 3.7)
--
-- 노인 무료 등급은 나이로 정해지는데, 지금까지는 가입 화면에서 **본인이 적은**
-- 생년월일만 봤습니다. 아무나 1950년생이라고 적으면 유료 등급을 공짜로 받습니다.
-- 카카오·네이버가 확인해 준 출생연도를 받아 오면 그 구멍이 막힙니다.
--
-- 이 칸은 "그 사람의 나이를 무엇으로 판단했는지" 를 남깁니다.
-- 나중에 무료 등급 대상을 점검할 때 근거가 됩니다.

ALTER TABLE member.users
  -- true = 카카오·네이버가 확인해 준 출생연도 / false = 본인이 적은 생년월일
  ADD COLUMN age_verified boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN member.users.age_verified IS '나이를 소셜(카카오·네이버)이 확인해 줬는지. false 면 본인 신고';
