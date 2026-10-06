-- 가입자의 **국가** (관리자 관제센터 01 종합 모니터링, 2026-10-06 결정)
--
-- 관리자 화면이 국가별 가입자·활성 사용자·결제자를 집계합니다. 그런데 지금까지
-- 국가를 받는 곳이 아무 데도 없었습니다.
--
-- **어디서 받나**: 휴대폰 인증 화면에서 고릅니다 (대표님 결정 2026-10-06).
-- 전원이 전화번호 인증을 거치므로 빠지는 사람이 없고, 가입 단계가 늘지 않습니다.
--
-- **왜 ISO 3166-1 alpha-2 인가**: `KR` `US` `JP` 처럼 두 글자로 정해진 국제 표준입니다.
-- 피그마 화면의 국가 배지(KR·US·JP…)와 그대로 맞고, 나라 이름을 번역해 둘 필요가
-- 없습니다 (화면에서 코드 → 이름으로 바꿔 보여 줍니다).
--
-- **기본값이 KR 인 이유**: 지금 가입자는 전부 국내입니다. 새 칸을 NOT NULL 로 두면서
-- 기존 행을 채우려면 값이 필요한데, 운영 DB 는 아직 가입자가 0 명이고 개발 DB 의
-- 씨드 계정도 전부 국내 번호입니다.
ALTER TABLE member.users
  ADD COLUMN country char(2) NOT NULL DEFAULT 'KR';

-- 대문자 두 글자만 받습니다. 소문자 'kr' 과 'KR' 이 섞이면 집계가 둘로 갈라집니다
ALTER TABLE member.users
  ADD CONSTRAINT users_country_check CHECK (country ~ '^[A-Z]{2}$');

-- 국가별 집계가 관리자 화면의 기본 질의라 미리 만들어 둡니다
CREATE INDEX users_country_idx ON member.users (country);
