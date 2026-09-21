-- SOS 녹음도 같은 저장소에 (WBS 7.9)
--
-- 파일을 두 군데로 나누면 용량 계산과 정리가 두 배로 복잡해집니다.
-- 사진·동영상과 같은 표를 쓰되 종류만 구분합니다.

ALTER TABLE media.assets DROP CONSTRAINT assets_kind_check;
ALTER TABLE media.assets ADD CONSTRAINT assets_kind_check CHECK (kind IN ('image', 'video', 'audio'));
