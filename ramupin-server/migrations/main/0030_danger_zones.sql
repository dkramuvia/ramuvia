-- 위험지역 (WBS 9.6)
--
-- 낙석 주의 구간·침수 구역처럼 **모두에게 공통인** 위험한 곳입니다.
-- 안심장소(`member.safe_zones`)와 다릅니다 — 그건 사람마다 정하는 곳이고,
-- 이건 서비스가 정해서 모두에게 적용합니다.
--
-- **데이터는 아직 없습니다.** 공공데이터를 받기로 되어 있고(일정표 10-09),
-- 오면 이 표에 부어 넣기만 하면 코드 수정 없이 동작합니다.

CREATE TABLE config.danger_zones (
  id         uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  name       text NOT NULL,
  /** 낙석·침수·공사 등. 화면에서 아이콘을 가르는 데 씁니다 */
  kind       text NOT NULL DEFAULT 'general',
  latitude   double precision NOT NULL,
  longitude  double precision NOT NULL,
  radius_m   int NOT NULL CHECK (radius_m BETWEEN 30 AND 20000),
  enabled    boolean NOT NULL DEFAULT true,
  /**
   * 어디서 받은 자료인지 (공공데이터 기관명 등).
   * 자료가 바뀌었을 때 어느 줄을 갈아 끼울지 알아야 합니다
   */
  source     text NOT NULL DEFAULT 'manual',
  /** 그 자료에서의 고유 번호. 다시 받아올 때 같은 곳인지 알아보는 데 씁니다 */
  source_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 같은 자료를 다시 받아도 줄이 늘어나지 않게
CREATE UNIQUE INDEX danger_zones_source_idx ON config.danger_zones (source, source_key) WHERE source_key IS NOT NULL;

-- 위치가 들어올 때마다 "켜진 위험지역" 을 훑습니다
CREATE INDEX danger_zones_enabled_idx ON config.danger_zones (id) WHERE enabled;

-- 누가 언제 어느 위험지역에 들어갔는지.
-- **같은 곳에 계속 있는 동안 반복해서 알리지 않으려면** 직전 상태가 있어야 합니다
CREATE TABLE member.danger_zone_visits (
  user_id    uuid NOT NULL REFERENCES member.users(id) ON DELETE CASCADE,
  zone_id    uuid NOT NULL REFERENCES config.danger_zones(id) ON DELETE CASCADE,
  inside     boolean NOT NULL DEFAULT false,
  entered_at timestamptz,
  notified_at timestamptz,
  PRIMARY KEY (user_id, zone_id)
);

GRANT SELECT ON config.danger_zones TO app_main;
GRANT SELECT, INSERT, UPDATE, DELETE ON member.danger_zone_visits TO app_main;
