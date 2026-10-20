-- 위치정보 저장 암호화 2단계 — 본 DB 쪽 평문 칸을 없앱니다 (1단계 0036, common/location-crypto.ts)
--
-- 1단계 배포 뒤 모든 행이 암호화로 옮겨진 것을 확인했습니다 (2026-10-20 실서버 평문 0건).
-- 혹시 옮기지 못한 행이 남아 있으면 지우지 않고 멈춥니다.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM member.sos_events
    WHERE place_enc IS NULL
      AND (latitude IS NOT NULL OR longitude IS NOT NULL OR altitude IS NOT NULL OR place_name IS NOT NULL OR place_address IS NOT NULL)
  ) THEN
    RAISE EXCEPTION '암호화로 옮기지 못한 SOS 장소가 있습니다. 평문 칸을 지우지 않습니다';
  END IF;
  IF EXISTS (SELECT 1 FROM member.safe_zone_events WHERE coords_enc IS NULL) THEN
    RAISE EXCEPTION '암호화로 옮기지 못한 안심존 기록이 있습니다. 평문 칸을 지우지 않습니다';
  END IF;
END $$;

-- SOS 는 위치를 못 잡고 보낼 수도 있어 place_enc 는 비어 있을 수 있습니다
ALTER TABLE member.sos_events
  DROP COLUMN latitude,
  DROP COLUMN longitude,
  DROP COLUMN altitude,
  DROP COLUMN place_name,
  DROP COLUMN place_address;

ALTER TABLE member.safe_zone_events
  DROP COLUMN latitude,
  DROP COLUMN longitude,
  ALTER COLUMN coords_enc SET NOT NULL;
