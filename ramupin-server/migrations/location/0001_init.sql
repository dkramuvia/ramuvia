-- 위치 DB (ramupin_location): 나중에 별도 서버로 옮길 수 있게 본 DB 와 분리
-- user_id 는 본 DB member.users.id 값이지만 외래키는 걸지 않습니다 (DB 가 다름).

CREATE SCHEMA IF NOT EXISTS location;

-- 위치 이력: 월 단위 파티션, 6개월 지난 파티션은 통째로 삭제 (WBS 4.3)
CREATE TABLE location.location_points (
  user_id             uuid NOT NULL,
  measured_at         timestamptz NOT NULL,
  received_at         timestamptz NOT NULL DEFAULT now(),
  latitude            double precision NOT NULL,
  longitude           double precision NOT NULL,
  geog                geography (Point, 4326) NOT NULL,
  altitude            real,
  accuracy            real,
  altitude_accuracy   real,
  speed               real,
  heading             real,
  -- WBS 2.2·2.3: 위치 제공자, 위성 수, 신호 강도
  provider            text,
  satellites          smallint,
  signal_strength     real,
  battery             smallint,
  -- 적응형 전송 상태 (GPS 보고서): sos / geofence / low_battery / moving / still
  state               text,
  PRIMARY KEY (user_id, measured_at)
) PARTITION BY RANGE (measured_at);

CREATE INDEX location_points_geog_idx ON location.location_points USING gist (geog);

-- 해당 월 파티션을 만듭니다 (이미 있으면 그대로). API·배치가 매일 호출
CREATE OR REPLACE FUNCTION location.ensure_month_partition(target date)
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  start_date date := date_trunc('month', target)::date;
  end_date   date := (date_trunc('month', target) + interval '1 month')::date;
  part_name  text := format('location_points_%s', to_char(start_date, 'YYYYMM'));
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS location.%I PARTITION OF location.location_points FOR VALUES FROM (%L) TO (%L)',
    part_name, start_date, end_date
  );
END;
$$;

-- 보관 기간이 지난 파티션 삭제 (WBS 4.3: 6개월). 배치에서 호출
CREATE OR REPLACE FUNCTION location.drop_expired_partitions(keep_months int DEFAULT 6)
RETURNS int
LANGUAGE plpgsql AS $$
DECLARE
  cutoff   date := (date_trunc('month', now()) - make_interval(months => keep_months))::date;
  part     record;
  dropped  int := 0;
BEGIN
  FOR part IN
    SELECT c.relname
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_class p ON p.oid = i.inhparent
    JOIN pg_namespace n ON n.oid = p.relnamespace
    WHERE n.nspname = 'location' AND p.relname = 'location_points'
  LOOP
    IF to_date(right(part.relname, 6), 'YYYYMM') < cutoff THEN
      EXECUTE format('DROP TABLE location.%I', part.relname);
      dropped := dropped + 1;
    END IF;
  END LOOP;
  RETURN dropped;
END;
$$;

SELECT location.ensure_month_partition(now()::date);
SELECT location.ensure_month_partition((now() + interval '1 month')::date);

-- 30분 이상 머문 장소 (WBS 4.9)
CREATE TABLE location.stays (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL,
  geog                geography (Point, 4326) NOT NULL,
  place_name          text,
  address             text,
  arrived_at          timestamptz NOT NULL,
  left_at             timestamptz
);
CREATE INDEX stays_user_time_idx ON location.stays (user_id, arrived_at DESC);

-- 위치정보 이용·제공 사실 확인자료 (위치정보법 보관 의무)
CREATE TABLE location.location_access_logs (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subject_user_id     uuid NOT NULL,
  viewer_user_id      uuid,
  purpose             text NOT NULL,
  accessed_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX location_access_logs_subject_idx ON location.location_access_logs (subject_user_id, accessed_at DESC);

-- ─────────────── 앱 계정 권한 ───────────────
GRANT USAGE ON SCHEMA location TO app_location;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA location TO app_location;
ALTER DEFAULT PRIVILEGES IN SCHEMA location GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_location;
-- 파티션 생성은 함수 소유자(마이그레이션 계정) 권한으로 실행
ALTER FUNCTION location.ensure_month_partition(date) SECURITY DEFINER;
ALTER FUNCTION location.drop_expired_partitions(int) SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION location.ensure_month_partition(date), location.drop_expired_partitions(int) TO app_location;
