-- 예약 메시지 매일 반복 (대표 리포트 10: 복약 시간 알림)
--   none  : 한 번만 (지금까지)
--   daily : 매일 같은 시각. 보낸 뒤 scheduled_at 을 다음 날로 옮기고 sent_at 은 비워 둡니다
ALTER TABLE member.scheduled_messages
  ADD COLUMN repeat text NOT NULL DEFAULT 'none' CHECK (repeat IN ('none', 'daily')),
  ADD COLUMN last_sent_at timestamptz;
