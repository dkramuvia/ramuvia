-- 위치정보 저장 암호화 2단계: 평문 좌표 칸을 없앱니다 (1단계 0006, common/location-crypto.ts)
--
-- 1단계 배포 뒤 모든 행이 암호화로 옮겨진 것을 확인했습니다 (2026-10-20 실서버 평문 0건).
-- 혹시 옮기지 못한 행이 남아 있으면 지우지 않고 멈춥니다 — 지우면 그 위치는 되살릴 수 없습니다.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM location.location_points WHERE coords_enc IS NULL) THEN
    RAISE EXCEPTION '암호화로 옮기지 못한 위치 이력이 있습니다. 평문 칸을 지우지 않습니다';
  END IF;
  IF EXISTS (SELECT 1 FROM location.user_status WHERE last_coords_enc IS NULL OR anchor_coords_enc IS NULL) THEN
    RAISE EXCEPTION '암호화로 옮기지 못한 마지막 위치가 있습니다. 평문 칸을 지우지 않습니다';
  END IF;
END $$;

DROP INDEX IF EXISTS location.location_points_geog_idx;
ALTER TABLE location.location_points
  DROP COLUMN latitude,
  DROP COLUMN longitude,
  DROP COLUMN geog,
  ALTER COLUMN coords_enc SET NOT NULL;

ALTER TABLE location.user_status
  DROP COLUMN last_latitude,
  DROP COLUMN last_longitude,
  DROP COLUMN fixed_anchor_latitude,
  DROP COLUMN fixed_anchor_longitude,
  ALTER COLUMN last_coords_enc SET NOT NULL,
  ALTER COLUMN anchor_coords_enc SET NOT NULL;
