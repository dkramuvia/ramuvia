-- 위치정보 저장 암호화: 칸마다 따로 암호화 — 본 DB 쪽 (1단계, common/location-crypto.ts)
--
-- SOS: 위도·경도·고도·장소명·주소를 한 칸(place_enc)에 넣던 것을 각각 나눕니다.
-- 안심존 출입: [위도, 경도] 한 칸(coords_enc)을 위도·경도로 나눕니다.
-- 기존 행은 서버가 켜질 때 옮기고(location/coords-split.service.ts), 다음 마이그레이션에서 옛 칸을 지웁니다.

ALTER TABLE member.sos_events ADD COLUMN IF NOT EXISTS latitude_enc bytea;
ALTER TABLE member.sos_events ADD COLUMN IF NOT EXISTS longitude_enc bytea;
ALTER TABLE member.sos_events ADD COLUMN IF NOT EXISTS altitude_enc bytea;
ALTER TABLE member.sos_events ADD COLUMN IF NOT EXISTS place_name_enc bytea;
ALTER TABLE member.sos_events ADD COLUMN IF NOT EXISTS place_address_enc bytea;

ALTER TABLE member.safe_zone_events ADD COLUMN IF NOT EXISTS latitude_enc bytea;
ALTER TABLE member.safe_zone_events ADD COLUMN IF NOT EXISTS longitude_enc bytea;
ALTER TABLE member.safe_zone_events ALTER COLUMN coords_enc DROP NOT NULL;
