-- 숨김 모드 두 가지 (WBS 12.7 · 12.8)
--   server_only : 친구에게는 숨기고 서버에는 보냄. SOS·이상징후 같은 위험 신호는 그대로 동작 (지금까지의 숨김 모드)
--   off_server  : 서버에도 보내지 않음. 위치가 없으니 이상징후(신호 끊김·움직임 없음) 감시도 쉽니다
ALTER TABLE member.users
  ADD COLUMN hide_scope text NOT NULL DEFAULT 'server_only'
  CHECK (hide_scope IN ('server_only', 'off_server'));
