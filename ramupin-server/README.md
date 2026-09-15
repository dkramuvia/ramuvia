# ramupin-server

라무핀 앱 백엔드 (NestJS 12 + PostgreSQL 17/PostGIS + Redis)

- 설계 방침: 앱 저장소 `ramupin/docs/backend-db-plan.md`
- **서버 1대에 DB까지** 올려 시작하고, **위치 데이터만 나중에 다른 DB 서버로 옮길 수 있게** 만들었습니다.

## 구조

```
docker-compose.yml        db(PostGIS) · redis · api(서버 배포용, profile app)
docker/postgres/          DB 이미지 + 첫 실행 스크립트 (위치 DB·앱 계정 생성)
migrations/main/          본 DB(ramupin) SQL — member / social / config 스키마
migrations/location/      위치 DB(ramupin_location) SQL — location 스키마, 월 파티션
scripts/migrate.mjs       마이그레이션 실행 (각 DB 의 schema_migrations 에 기록)
scripts/seed-dev.mjs      개발용 테스트 사용자·친구 (앱 목업과 같은 이름)
src/
  config/env.ts           환경변수 검증 (.env)
  database/               본 DB 연결 (MAIN_DB, 전역)
  location/               ★ 위치 DB 연결은 여기에만 (LOCATION_DB, 외부로 export 안 함)
  redis/                  Redis 연결 (현재 위치 캐시)
  auth/ users/ friends/ health/
```

## 위치 DB 분리 규칙

1. DB 연결은 2개: `MAIN_DATABASE_URL`, `LOCATION_DATABASE_URL` (지금은 같은 서버)
2. 위치 DB 는 `LocationService` 만 사용. 다른 모듈은 이 서비스 함수로만 위치를 다룸
3. 두 DB 사이 JOIN·외래키·트랜잭션 금지 (사용자 ID 값만 주고받고 앱에서 합침)
4. 앱 계정도 분리: `app_main` 은 위치 DB 에 **접속 자체가 안 됨**, 반대도 마찬가지
5. 나중에 옮길 때: 새 서버로 `ramupin_location` 복제 → `LOCATION_DATABASE_URL` 변경 → 재시작

## PC 에서 개발

사전 준비: Docker Desktop 실행 (Engine running), Node 24

```bash
npm install
cp .env.example .env         # 비밀번호 바꾸기
npm run db:up                # PostGIS · Redis 컨테이너
npm run db:migrate           # 테이블 생성
npm run db:seed              # 테스트 데이터 (강한 = 26467878)
npm run start:dev            # API http://localhost:3000
```

DB 를 처음 상태로: `npm run db:reset` (**데이터 전부 삭제**)

### 폰 앱과 연결 (USB)

```bash
adb reverse tcp:3000 tcp:3000
```
앱 `.env`: `EXPO_PUBLIC_USE_MOCK=false`, `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3000`

## API (현재)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | /health | 본 DB · 위치 DB · Redis 연결 확인 |
| POST | /auth/dev-login | 개발용 로그인 `{ "publicId": "26467878" }` → accessToken (`DEV_LOGIN_ENABLED=true` 일 때만) |
| GET | /me | 내 정보 |
| GET | /me/policy | 내 등급 정책 (+ 관리자 사용자별 값) |
| GET | /friends | 친구 목록 + 공유 수준에 따라 위치(정확/흐림/없음)·배터리 |
| POST | /locations | 위치 배치 업로드 `{ points: [...] }` (최대 500개, 중복 무시) |

인증: `Authorization: Bearer <accessToken>`

## 서버 1대에 올리기 (요약)

```bash
# EC2 (Amazon Linux)
sudo dnf install -y docker git && sudo systemctl enable --now docker
# docker compose 플러그인 설치 후
git clone <저장소> && cd ramupin-server
cp .env.example .env         # 운영 비밀번호, DEV_LOGIN_ENABLED=false, NODE_ENV=production
docker compose --profile app up -d --build
```
TODO(배포 시): DB 포트 외부 비노출 운영용 compose, nginx + HTTPS, 매일 DB 백업 → S3, 로그 수집

## 다음 작업

- 친구 요청·수락, 친구별 공유 설정 저장
- 그룹·채팅 (WebSocket), 위치 수신 큐(Redis Stream) + worker, 비상 상황 판정 배치
- 파일 업로드 (S3 Presigned URL), 실제 로그인(소셜·SMS)은 마지막
