-- 2단계에서 새로 만든 표들의 권한 (WBS 8.1, 8.2, 6)
--
-- 앱이 쓰는 계정(`app_main`)은 표를 만들지 못하고 읽고 쓰기만 합니다.
-- 표를 만들 때마다 권한을 줘야 하는데, 2단계 표 세 개가 빠져 있었습니다.
-- (`0028_post_shares` 를 붙인 뒤 "42501 권한 없음" 으로 드러났습니다)
GRANT SELECT, INSERT, UPDATE, DELETE ON
  member.scheduled_messages,
  member.notification_settings,
  media.post_shares
TO app_main;
