-- 위치정보 저장 암호화 1단계 — 본 DB 쪽 (common/location-crypto.ts)
--
-- SOS 를 누른 곳과 안심존을 드나든 곳은 "그 사람이 그때 어디 있었는지" 라서 위치 이력과 똑같이 다룹니다.
-- SOS 는 좌표·고도·장소명·주소를 한 덩어리로 암호화합니다 (장소명·주소도 위치를 알려 줍니다).
-- 기존 행은 서버가 켜질 때 암호화로 바꾸고 평문을 비웁니다 (location/coords-backfill.service.ts).

ALTER TABLE member.sos_events ADD COLUMN IF NOT EXISTS place_enc bytea;

ALTER TABLE member.safe_zone_events ADD COLUMN IF NOT EXISTS coords_enc bytea;
ALTER TABLE member.safe_zone_events
  ALTER COLUMN latitude DROP NOT NULL,
  ALTER COLUMN longitude DROP NOT NULL;
