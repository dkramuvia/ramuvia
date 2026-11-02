-- 긴급 연락 시간 수정 (안전 & SOS, 피그마 v2.5 878). 11-02 대표님 확정: 기본 48시간 · 10%.
-- 입력란을 비우면 NULL 이고, 그 경고는 친구에게 보내지 않습니다. 1인 가구 안심 모드는 solo_settings 를 따릅니다
ALTER TABLE member.safety_settings
  ADD COLUMN fixed_alert_hours smallint DEFAULT 48 CHECK (fixed_alert_hours BETWEEN 3 AND 168),
  ADD COLUMN low_battery_percent smallint DEFAULT 10 CHECK (low_battery_percent BETWEEN 5 AND 50);
