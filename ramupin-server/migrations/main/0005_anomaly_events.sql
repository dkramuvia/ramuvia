-- 이상징후 발생 기록 (docs/anomaly-alerts.md)
--
-- 한 줄 = "누구에게 어떤 트랙의 몇 단계가 언제 생겼고 언제 풀렸는지".
-- 같은 단계를 두 번 알리지 않기 위한 근거이자, 모니터링 사이트가 읽는 목록입니다.

CREATE TABLE member.anomaly_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES member.users (id) ON DELETE CASCADE,

  -- battery(A·B) / gps_fixed(C·D) / fixed_battery_zero(E·F) / fixed_charging(G·H) / no_signal(I·J)
  track        text NOT NULL,
  -- low / zero / 3h / 12h / 24h / 48h / 30m / 1h  (트랙마다 쓰는 값이 다름)
  stage        text NOT NULL,
  -- friends = 친구에게 알림 / monitoring = 모니터링 사이트에만 표시 (1인단독)
  target       text NOT NULL,

  detected_at  timestamptz NOT NULL DEFAULT now(),
  -- 다시 움직이거나 전화기를 켜면 자동 해제. 기록은 남깁니다 (09-17 확정)
  cleared_at   timestamptz,
  -- 모니터링 사이트에서 사람이 "확인함"을 누른 시각 (전화는 사람이 직접)
  acknowledged_at timestamptz
);

-- 같은 단계는 열려 있는 동안 한 번만 (중복 알림 방지)
CREATE UNIQUE INDEX anomaly_events_open_unique
  ON member.anomaly_events (user_id, track, stage)
  WHERE cleared_at IS NULL;

-- 모니터링 목록: 아직 안 풀린 것을 최근 순으로
CREATE INDEX anomaly_events_open_idx
  ON member.anomaly_events (detected_at DESC)
  WHERE cleared_at IS NULL;

CREATE INDEX anomaly_events_user_idx ON member.anomaly_events (user_id, detected_at DESC);
