-- 지도에 띄울 병원 (건강보험심사평가원 병원정보서비스 v2, 11-02 대표님 확정: 전국 모든 병원 + 이름).
-- 사람마다 다른 자료가 아니라 모두에게 공통인 공공데이터라 config 에 둡니다.
-- 서버가 일주일마다 전국 약 8만 곳을 통째로 받아 갈아 끼웁니다 (hospitals.module.ts)
CREATE TABLE config.hospitals (
  -- 심평원 암호화 요양기호. 다시 받아도 같은 병원이면 같은 값입니다
  ykiho      text PRIMARY KEY,
  name       text NOT NULL,
  -- 종별 (01 상급종합 · 11 종합병원 · 21 병원 · 31 의원 · 71 보건소 ...)
  kind_code  text,
  kind_name  text,
  address    text,
  phone      text,
  latitude   double precision NOT NULL,
  longitude  double precision NOT NULL,
  synced_at  timestamptz NOT NULL DEFAULT now()
);

-- 지도에 보이는 네모 영역으로 찾습니다
CREATE INDEX hospitals_lat_lng_idx ON config.hospitals (latitude, longitude);
