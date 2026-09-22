-- 이상징후 감시가 전 사용자를 훑지 않도록 (2026-09-22)
--
-- 지금까지 5분마다 user_status 전체를 읽어 메모리에 올렸습니다.
-- 10만 대면 버티지만 100만 대면 5분마다 100만 행(하루 2.9억 행)이라 감당이 안 됩니다.
--
-- 실제로 봐야 하는 사람은 아래 넷 중 하나에 해당하는 소수입니다.
-- 그 사람만 골라낼 수 있도록 인덱스를 답니다.
--
--   1) 신호가 끊긴 지 오래됨        last_measured_at 이 오래됨
--   2) 한자리에 오래 머묾           fixed_since 가 오래됨
--   3) 배터리 0% 가 이어짐          battery_zero_since 가 있음
--   4) 배터리가 얼마 안 남음        last_battery 가 낮음

-- 1) 은 user_status_last_measured_idx (0003) 로 이미 있습니다

-- 2) 한자리에 머문 시간
CREATE INDEX IF NOT EXISTS user_status_fixed_since_idx ON location.user_status (fixed_since);

-- 3) 배터리 0% 인 사람만 (대부분은 NULL 이라 인덱스가 아주 작습니다)
CREATE INDEX IF NOT EXISTS user_status_battery_zero_idx
  ON location.user_status (battery_zero_since)
  WHERE battery_zero_since IS NOT NULL;

-- 4) 배터리가 적은 사람만. 기준(10%)보다 넉넉히 잡아 정책을 올려도 인덱스를 다시 안 만들게 합니다
CREATE INDEX IF NOT EXISTS user_status_low_battery_idx
  ON location.user_status (last_battery)
  WHERE last_battery <= 30;
