-- 이상징후 판정에 쓰는 "사용자별 마지막 상태" (docs/anomaly-alerts.md)
--
-- 왜 따로 두나: 이상징후 감시 배치가 5분마다 전체 사용자를 훑어야 하는데,
-- 그때마다 수억 건짜리 location_points 를 뒤질 수는 없습니다.
-- 위치가 들어올 때마다 이 표 한 줄만 갱신해 두고, 배치는 이 표만 읽습니다.

CREATE TABLE IF NOT EXISTS location.user_status (
  user_id                  uuid PRIMARY KEY,
  -- 마지막으로 받은 위치 (신호 두절 판정: now() - last_measured_at)
  last_measured_at         timestamptz NOT NULL,
  last_latitude            double precision NOT NULL,
  last_longitude           double precision NOT NULL,
  last_battery             smallint,
  last_charging            boolean,

  -- 위치 고정 판정: anchor 에서 반경(기본 50m) 밖으로 나가면 anchor 와 fixed_since 를 새로 잡습니다.
  -- 즉 fixed_since 는 "지금 자리에 머물기 시작한 시각"입니다.
  fixed_anchor_latitude    double precision NOT NULL,
  fixed_anchor_longitude   double precision NOT NULL,
  fixed_since              timestamptz NOT NULL,

  -- 배터리가 0% 가 된 시각 (0% 를 벗어나면 NULL)
  battery_zero_since       timestamptz,

  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- 배치가 "오래 소식 없는 사람"부터 훑을 수 있게
CREATE INDEX IF NOT EXISTS user_status_last_measured_idx ON location.user_status (last_measured_at);
