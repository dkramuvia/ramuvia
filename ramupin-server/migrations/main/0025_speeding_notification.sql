-- 과속 알림 켜고 끄기 (WBS 8.1)
--
-- 친구별로 받을지는 `social.friend_alert_settings.speeding` 이 정하고,
-- 이건 **내가 과속 알림을 아예 안 받겠다** 는 스위치입니다.
--
-- SOS 와 따로 두는 이유: SOS 는 방해 금지 시간에도 보냅니다(사람이 위험한 상황).
-- 과속은 친구가 빨리 달린다는 소식이라, 새벽에 깨울 일은 아닙니다.
ALTER TABLE member.notification_settings
  ADD COLUMN speeding boolean NOT NULL DEFAULT true;
