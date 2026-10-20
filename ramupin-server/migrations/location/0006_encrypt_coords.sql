-- 위치정보 저장 암호화 1단계 (위치정보법 기술적 보호조치, common/location-crypto.ts)
--
-- 좌표를 AES-256-GCM 으로 암호화한 칸을 더하고, 평문 칸은 비워도 되게 합니다.
-- 기존 행은 서버가 켜질 때 암호화로 바꾸고 평문을 비웁니다 (location/coords-backfill.service.ts).
-- 평문이 하나도 남지 않은 것을 확인한 뒤 다음 마이그레이션에서 평문 칸을 없앱니다.

ALTER TABLE location.location_points ADD COLUMN IF NOT EXISTS coords_enc bytea;
ALTER TABLE location.location_points
  ALTER COLUMN latitude DROP NOT NULL,
  ALTER COLUMN longitude DROP NOT NULL,
  ALTER COLUMN geog DROP NOT NULL;

ALTER TABLE location.user_status ADD COLUMN IF NOT EXISTS last_coords_enc bytea;
ALTER TABLE location.user_status ADD COLUMN IF NOT EXISTS anchor_coords_enc bytea;
ALTER TABLE location.user_status
  ALTER COLUMN last_latitude DROP NOT NULL,
  ALTER COLUMN last_longitude DROP NOT NULL,
  ALTER COLUMN fixed_anchor_latitude DROP NOT NULL,
  ALTER COLUMN fixed_anchor_longitude DROP NOT NULL;
