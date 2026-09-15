#!/bin/bash
# 처음 DB 볼륨이 만들어질 때 한 번만 실행됩니다 (PostGIS 이미지의 10_postgis.sh 다음).
# - 앱 계정 2개: app_main (본 DB 전용), app_location (위치 DB 전용)
# - 위치 전용 데이터베이스 ramupin_location
# 테이블은 여기서 만들지 않고 migrations/ 의 SQL 로 만듭니다 (npm run db:migrate).
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE ROLE app_main LOGIN PASSWORD '${APP_MAIN_PASSWORD}';
  CREATE ROLE app_location LOGIN PASSWORD '${APP_LOCATION_PASSWORD}';

  CREATE DATABASE ramupin_location;

  -- 각 앱 계정은 자기 데이터베이스에만 접속 가능
  REVOKE CONNECT ON DATABASE ramupin FROM PUBLIC;
  GRANT CONNECT ON DATABASE ramupin TO app_main;

  CREATE EXTENSION IF NOT EXISTS postgis;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname ramupin_location <<-EOSQL
  REVOKE CONNECT ON DATABASE ramupin_location FROM PUBLIC;
  GRANT CONNECT ON DATABASE ramupin_location TO app_location;

  CREATE EXTENSION IF NOT EXISTS postgis;
EOSQL
