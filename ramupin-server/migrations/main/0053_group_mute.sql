-- 그룹방 알림 끄기 (대표 리포트 36, 보완 4.20). 나에게만 적용되며 SOS 와는 상관없습니다 (채팅 푸시만 거름)
ALTER TABLE social.group_members ADD COLUMN muted boolean NOT NULL DEFAULT false;
