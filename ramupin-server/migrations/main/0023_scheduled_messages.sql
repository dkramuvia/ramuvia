-- 예약 메시지 (WBS 8.2)
--
-- 내가 친구에게 "언제 무슨 말을 해 줘라" 를 미리 걸어 둡니다.
-- 받는 쪽 폰에서는 소리로 읽어 주기도 합니다 (tts).
--
-- **왜 서버가 보내나**: 보내는 사람 폰이 꺼져 있어도 가야 합니다.
-- 약 챙기기·병원 가기 같은 용도라 "폰이 켜져 있을 때만 감"은 쓸모가 없습니다.

CREATE TABLE member.scheduled_messages (
  id         uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  -- 예약을 건 사람
  user_id    uuid NOT NULL REFERENCES member.users(id) ON DELETE CASCADE,
  -- 받을 사람 (내 친구)
  target_id  uuid NOT NULL REFERENCES member.users(id) ON DELETE CASCADE,
  title      text NOT NULL,
  body       text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  -- 받는 폰에서 소리로 읽어 줄지
  tts        boolean NOT NULL DEFAULT true,

  -- 보낸 시각. NULL 이면 아직 안 보냈습니다.
  -- 지웠다 다시 만들지 않고 이 칸만 채웁니다 — 보냈는지를 나중에 확인할 수 있어야 합니다
  sent_at    timestamptz,
  -- 못 보낸 이유 (친구가 끊겼다, 푸시 토큰이 없다 등)
  failed_reason text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 목록 화면: 내가 건 예약을 시간 순으로
CREATE INDEX scheduled_messages_user_idx ON member.scheduled_messages (user_id, scheduled_at);

-- **보낼 것 찾기**: 발송기가 몇 초마다 이 조건으로 훑습니다.
-- 아직 안 보낸 것만 남기는 부분 인덱스라, 보낸 것이 쌓여도 훑는 양이 늘지 않습니다
CREATE INDEX scheduled_messages_due_idx ON member.scheduled_messages (scheduled_at)
  WHERE sent_at IS NULL;
