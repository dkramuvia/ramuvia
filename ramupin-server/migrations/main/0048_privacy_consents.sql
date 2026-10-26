-- 개인정보 센터 동의 관리 (보완 화면 설계 4.13, GDPR · CCPA)
--
--   맞춤 광고(광고 회사와 기기 식별자 공유)는 기본 끔, 서비스 개선 분석(위치 제외)은 기본 켬,
--   내 개인정보 판매·공유 거부(CCPA)는 기본 끔(=거부 안 함). 마케팅 알림은 알림 설정(marketing)과 같은 값입니다.
--   동의 철회는 바로 반영합니다.

CREATE TABLE member.privacy_consents (
  user_id          uuid PRIMARY KEY REFERENCES member.users(id) ON DELETE CASCADE,
  ads_personalized boolean NOT NULL DEFAULT false,
  analytics        boolean NOT NULL DEFAULT true,
  do_not_sell      boolean NOT NULL DEFAULT false,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON member.privacy_consents TO app_main;
