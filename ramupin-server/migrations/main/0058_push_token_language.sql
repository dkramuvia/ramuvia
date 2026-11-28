-- 푸시 언어 (11-26): 기기마다 앱 언어를 저장해, 한국어가 아닌 기기에는 영어로 보냅니다.
-- 지금까지 등록된 기기는 모두 한국어로 둡니다. 앱이 다음에 켜질 때 실제 언어로 다시 올립니다
ALTER TABLE member.push_tokens ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'ko';
