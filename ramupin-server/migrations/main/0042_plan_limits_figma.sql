-- 등급 한도를 피그마 결제 화면 값으로 맞춥니다 (10-26 대표님)
--
--   장소(즐겨찾기)와 안심존을 한 한도로 묶습니다.
--     placeLimit         = 저장할 수 있는 장소 수 (즐겨찾기 + 안심존 모두)
--     geofenceAlertLimit = 그중 드나들 때 알림을 켤 수 있는 장소(=안심존) 수
--   예전 geofenceAlertLimit 은 "안심존 하나에 알림 받을 친구 수" 였고, 장소 수는 safeZoneLimit 이었습니다.
--   safeZoneLimit 은 더 쓰지 않으므로 지웁니다.
--
--   locationRetentionDays = 위치 기록(이동 경로·머문 곳) 보관 일수. 베이직 7 · 플래티넘 15 · 트리니티 30
--   케어·가디언은 한도를 그대로 두고 보관 일수만 피그마 값(15일)을 넣습니다.

UPDATE config.plan_policies
SET policy = (policy - 'safeZoneLimit') || CASE plan
      WHEN 'basic'    THEN '{"placeLimit":5,"geofenceAlertLimit":2,"scheduledMessageRecipientLimit":2,"sosRecipientLimit":1,"photoStorageMb":300,"locationRetentionDays":7}'
      WHEN 'platinum' THEN '{"placeLimit":20,"geofenceAlertLimit":5,"scheduledMessageRecipientLimit":10,"sosRecipientLimit":3,"photoStorageMb":1024,"locationRetentionDays":15}'
      WHEN 'trinity'  THEN '{"placeLimit":50,"geofenceAlertLimit":10,"scheduledMessageRecipientLimit":30,"sosRecipientLimit":20,"photoStorageMb":5120,"locationRetentionDays":30}'
      ELSE '{"locationRetentionDays":15}'
    END::jsonb,
    updated_at = now();

-- 사람별 예외에 남은 옛 키도 지웁니다. geofenceAlertLimit 예외는 뜻이 바뀌었으므로 함께 지웁니다
UPDATE config.user_policy_overrides
SET policy = policy - 'safeZoneLimit' - 'geofenceAlertLimit',
    updated_at = now()
WHERE policy ?| array['safeZoneLimit', 'geofenceAlertLimit'];
