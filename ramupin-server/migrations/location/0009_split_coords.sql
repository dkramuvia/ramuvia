-- 위치정보 저장 암호화: 위도·경도·고도를 칸마다 따로 암호화 (1단계, common/location-crypto.ts)
--
-- 10-20 에는 [위도, 경도] 를 한 칸(coords_enc)에 넣었고 고도는 평문이었습니다.
-- 신고 서식 예시처럼 칸마다 따로 암호화하고, 고도도 암호화합니다.
-- 기존 행은 서버가 켜질 때 옮기고(location/coords-split.service.ts), 다음 마이그레이션에서 옛 칸을 지웁니다.

ALTER TABLE location.location_points ADD COLUMN IF NOT EXISTS latitude_enc bytea;
ALTER TABLE location.location_points ADD COLUMN IF NOT EXISTS longitude_enc bytea;
ALTER TABLE location.location_points ADD COLUMN IF NOT EXISTS altitude_enc bytea;
ALTER TABLE location.location_points ALTER COLUMN coords_enc DROP NOT NULL;

ALTER TABLE location.user_status ADD COLUMN IF NOT EXISTS last_latitude_enc bytea;
ALTER TABLE location.user_status ADD COLUMN IF NOT EXISTS last_longitude_enc bytea;
ALTER TABLE location.user_status ADD COLUMN IF NOT EXISTS anchor_latitude_enc bytea;
ALTER TABLE location.user_status ADD COLUMN IF NOT EXISTS anchor_longitude_enc bytea;
ALTER TABLE location.user_status
  ALTER COLUMN last_coords_enc DROP NOT NULL,
  ALTER COLUMN anchor_coords_enc DROP NOT NULL;
