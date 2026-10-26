-- 1:1 채팅 사진 메시지 (보완 화면 설계 4.18)
--
--   사진은 갤러리와 같은 저장소(media.assets)에 올리고, 메시지는 그 id 만 가리킵니다.
--   사진 용량은 등급의 사진 공유 용량에 함께 들어갑니다 (media.assets 로 셉니다).
--   위치 포함을 고르면 place 에 찍은 곳을 같이 둡니다 (기본은 포함 안 함).

ALTER TABLE chat.messages DROP CONSTRAINT messages_type_check;
ALTER TABLE chat.messages ADD CONSTRAINT messages_type_check CHECK (type IN ('text', 'location', 'system', 'photo'));

-- 사진 메시지는 글이 없어도 됩니다
ALTER TABLE chat.messages DROP CONSTRAINT messages_check1;
ALTER TABLE chat.messages ADD CONSTRAINT messages_check1 CHECK (type IN ('location', 'photo') OR text IS NOT NULL);

-- 사진 파일이 지워지면(탈퇴 등) 메시지는 "사진을 볼 수 없어요" 로 남습니다
ALTER TABLE chat.messages ADD COLUMN asset_id uuid REFERENCES media.assets(id) ON DELETE SET NULL;
