-- 푸시 알림 토큰 (WBS 6단계, FCM)
--
-- 기기마다 하나씩 생깁니다. 앱을 지우거나 로그아웃하면 지웁니다.
-- 같은 토큰이 다른 계정으로 넘어갈 수 있어(기기 물려주기) 토큰을 기준으로 유일하게 둡니다.

CREATE TABLE member.push_tokens (
  token       text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES member.users (id) ON DELETE CASCADE,
  platform    text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- 발송이 계속 실패하면(앱 삭제 등) 지웁니다
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX push_tokens_user_idx ON member.push_tokens (user_id);
