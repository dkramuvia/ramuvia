-- 기본키 생성 방식을 UUIDv7 으로 교체 (2026-09-22)
--
-- 이미 만들어진 행은 그대로 둡니다. v4 와 v7 은 형식이 같아 섞여 있어도 문제없고,
-- 지금 있는 것은 전부 시험용 데이터입니다. 새로 만들어지는 행부터 시간순이 됩니다.

ALTER TABLE member.users            ALTER COLUMN id SET DEFAULT public.uuid_generate_v7();
ALTER TABLE member.devices          ALTER COLUMN id SET DEFAULT public.uuid_generate_v7();
ALTER TABLE member.sessions         ALTER COLUMN id SET DEFAULT public.uuid_generate_v7();
ALTER TABLE member.social_accounts  ALTER COLUMN id SET DEFAULT public.uuid_generate_v7();
ALTER TABLE member.anomaly_events   ALTER COLUMN id SET DEFAULT public.uuid_generate_v7();
ALTER TABLE member.sos_events       ALTER COLUMN id SET DEFAULT public.uuid_generate_v7();
ALTER TABLE social.groups           ALTER COLUMN id SET DEFAULT public.uuid_generate_v7();
ALTER TABLE social.friend_requests  ALTER COLUMN id SET DEFAULT public.uuid_generate_v7();
ALTER TABLE chat.messages           ALTER COLUMN id SET DEFAULT public.uuid_generate_v7();
ALTER TABLE media.assets            ALTER COLUMN id SET DEFAULT public.uuid_generate_v7();
ALTER TABLE media.posts             ALTER COLUMN id SET DEFAULT public.uuid_generate_v7();
ALTER TABLE config.admin_users      ALTER COLUMN id SET DEFAULT public.uuid_generate_v7();
