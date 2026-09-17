-- 이상징후 알림 (docs/anomaly-alerts.md 트랙 G·H): "배터리 100% 충전중"과
-- "배터리 100%인데 신호가 끊김"은 위험도가 완전히 다릅니다. 충전 여부를 함께 저장합니다.
-- null = 앱이 아직 안 보내는 옛 버전

ALTER TABLE location.location_points
  ADD COLUMN IF NOT EXISTS charging boolean;

COMMENT ON COLUMN location.location_points.charging IS '측정 시점에 충전 중이었는지 (이상징후 판정용)';
