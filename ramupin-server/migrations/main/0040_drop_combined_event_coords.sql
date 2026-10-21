-- 위치정보 칸마다 암호화 2단계 — 본 DB 쪽 나누기 전 칸을 없앱니다 (1단계 0039)
--
-- 1단계 배포 뒤 모든 행이 옮겨진 것을 확인했습니다 (2026-10-21 실서버: SOS 7건, 안심존 기록 13건, 옛 칸 0건).
-- 혹시 옮기지 못한 행이 남아 있으면 지우지 않고 멈춥니다.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM member.sos_events WHERE place_enc IS NOT NULL) THEN
    RAISE EXCEPTION '칸을 나누지 못한 SOS 장소가 있습니다. 옛 칸을 지우지 않습니다';
  END IF;
  IF EXISTS (SELECT 1 FROM member.safe_zone_events WHERE coords_enc IS NOT NULL OR latitude_enc IS NULL OR longitude_enc IS NULL) THEN
    RAISE EXCEPTION '칸을 나누지 못한 안심존 기록이 있습니다. 옛 칸을 지우지 않습니다';
  END IF;
END $$;

-- SOS 는 위치를 못 잡고 보낼 수도 있어 다섯 칸 모두 비어 있을 수 있습니다
ALTER TABLE member.sos_events DROP COLUMN place_enc;

ALTER TABLE member.safe_zone_events
  DROP COLUMN coords_enc,
  ALTER COLUMN latitude_enc SET NOT NULL,
  ALTER COLUMN longitude_enc SET NOT NULL;
