-- 위치정보 칸마다 암호화 2단계: 나누기 전 칸(한 덩어리 coords_enc, 평문 고도)을 없앱니다 (1단계 0009)
--
-- 1단계 배포 뒤 모든 행이 옮겨진 것을 확인했습니다 (2026-10-21 실서버: 위치 29,502건, 옛 칸 0건).
-- 혹시 옮기지 못한 행이 남아 있으면 지우지 않고 멈춥니다 — 지우면 그 위치는 되살릴 수 없습니다.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM location.location_points WHERE coords_enc IS NOT NULL OR altitude IS NOT NULL OR latitude_enc IS NULL OR longitude_enc IS NULL) THEN
    RAISE EXCEPTION '칸을 나누지 못한 위치 이력이 있습니다. 옛 칸을 지우지 않습니다';
  END IF;
  IF EXISTS (
    SELECT 1 FROM location.user_status
    WHERE last_coords_enc IS NOT NULL OR anchor_coords_enc IS NOT NULL
       OR last_latitude_enc IS NULL OR last_longitude_enc IS NULL OR anchor_latitude_enc IS NULL OR anchor_longitude_enc IS NULL
  ) THEN
    RAISE EXCEPTION '칸을 나누지 못한 마지막 위치가 있습니다. 옛 칸을 지우지 않습니다';
  END IF;
END $$;

ALTER TABLE location.location_points
  DROP COLUMN coords_enc,
  DROP COLUMN altitude,
  ALTER COLUMN latitude_enc SET NOT NULL,
  ALTER COLUMN longitude_enc SET NOT NULL;

ALTER TABLE location.user_status
  DROP COLUMN last_coords_enc,
  DROP COLUMN anchor_coords_enc,
  ALTER COLUMN last_latitude_enc SET NOT NULL,
  ALTER COLUMN last_longitude_enc SET NOT NULL,
  ALTER COLUMN anchor_latitude_enc SET NOT NULL,
  ALTER COLUMN anchor_longitude_enc SET NOT NULL;
