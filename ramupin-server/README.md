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
npm run dev:simulate         # (선택) 친구들 위치를 10초마다 전송 → 앱 지도에서 움직임 확인
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
| POST | /auth/kakao | 카카오 로그인 `{ accessToken, device }` → `ok` 토큰 / `device_verification_required` / `sign_up_required` |
| GET | /auth/nickname-check?nickname= | 닉네임 사용 가능 여부 (2~8자) |
| POST | /auth/sign-up/sms | 가입 중 휴대폰 인증번호 발송 `{ signUpToken, phone }` → 이미 가입된 번호면 `alreadyRegistered` |
| POST | /auth/sign-up/sms/verify | 인증번호 확인 `{ signUpToken, code }` |
| POST | /auth/sign-up | 가입 완료 `{ signUpToken, nickname, gender, birthDate, agreedTerms, singleHousehold, device }` → 회원 생성 + 토큰 |
| POST | /auth/dev-sign-up-token | 개발용: 카카오 없이 가입 흐름 시험 (`DEV_LOGIN_ENABLED=true` 일 때만) |
| POST | /auth/dev-login | 개발용 로그인 `{ publicId, device }` → `status: ok` 토큰 또는 `device_verification_required` (`DEV_LOGIN_ENABLED=true` 일 때만) |
| POST | /auth/device-verification/send | 새 기기 인증번호 발송 `{ challengeId }` (dev: 123456, 서버 로그에 출력) |
| POST | /auth/device-verification/verify | 인증번호 확인 `{ challengeId, code }` → 이전 기기 로그인 끊고 토큰 발급 |
| POST | /auth/refresh | `{ refreshToken }` → 새 access·refresh token (refresh token 도 매번 교체) |
| POST | /auth/logout | 현재 세션 끊기 |
| GET | /me | 내 정보 |
| GET | /me/policy | 내 등급 정책 (+ 관리자 사용자별 값) |
| PUT | /me/single-household | 1인 가구 모드 `{ enabled }` |
| GET | /users/lookup?publicId= | 8자리 ID(입력·QR)로 사용자 찾기 + 관계(self/friend/request_sent/request_received/none), 분당 20회 |
| GET | /friends | 친구 목록 + 공유 수준에 따라 위치(정확/흐림/없음)·배터리 |
| GET | /friends/requests | 대기 중인 친구 요청 `{ received, sent }` |
| GET | /friends/requests/:id | 요청 상세 (보낸/받은 사람만) |
| POST | /friends/requests | 친구 요청 `{ userId }` → `pending`, 상대가 먼저 요청했으면 바로 `accepted`. 하루 50회 |
| POST | /friends/requests/:id/accept | 수락 → 양방향 친구 + 공유 설정(기본 비공개), `{ singleHouseholdReleasable }` |
| POST | /friends/requests/:id/reject | 거절 |
| DELETE | /friends/requests/:id | 보낸 요청 취소 |
| GET·PUT | /friends/:friendId/share-setting | 내가 친구에게 공유하는 수준 (흐림 → 경로 끔, 비공개 → 전부 끔을 서버가 강제) |
| POST | /locations | 위치 배치 업로드 `{ points: [...] }` (최대 500개, 중복 무시) |

인증: `Authorization: Bearer <accessToken>` (1시간). 401 응답의 `code` 로 앱이 분기합니다: `TOKEN_EXPIRED`(refresh), `SESSION_REPLACED`(다른 기기 로그인), `SESSION_REVOKED`(로그아웃됨)

### 소셜 로그인과 가입

- 앱이 카카오 SDK 로 받은 access token 을 서버가 카카오에 확인하고, **우리 앱(KAKAO_APP_ID)에서 발급된 토큰인지** 검사합니다.
- 처음 온 사람은 `sign_up_required` + 가입 토큰(30분) → 휴대폰 문자 인증 → 프로필·약관 → 가입 완료 순서입니다.
- **전화번호는 소셜에서 받지 않고 직접 인증**합니다 (비즈 앱 전환 불필요). 만 75세 이상이면 케어(무료) 등급으로 가입합니다. TODO(정책): 70/75 확정
- 네이버·구글 등 다른 소셜도 같은 `LoginService.login()` / `SignUpService` 를 그대로 씁니다.

### 전화번호 보관 (개인정보)

- 회원 테이블이 아니라 **별도 테이블 `member.user_phones`** 에 둡니다.
- 원문은 AES-256-GCM 암호화(`PHONE_ENC_KEY`), 중복 가입 확인은 HMAC 해시(`PHONE_HASH_KEY`)로만 합니다.
- **원문 복호화는 `PhoneService` 에서만** 하고, 꺼낼 때마다 `member.phone_access_logs` 에 목적과 요청자를 남깁니다.
- ★ 운영 키를 잃어버리면 기존 가입자의 번호를 읽을 수 없습니다. 안전한 곳(예: AWS Secrets Manager)에 보관하세요.

### 기기 1대 로그인 규칙

- 한 계정의 끊기지 않은 세션은 1개뿐입니다 (DB 부분 유니크 인덱스 `sessions_one_active_per_user`). 새로 로그인하면 이전 세션은 `replaced`.
- 마지막으로 로그인한 기기와 **설치 ID + 기기 키**가 모두 같을 때만 문자 인증 없이 로그인됩니다. 기기 키는 로그인할 때마다 서버가 새로 발급하고 앱은 보안 저장소에 보관합니다 (설치 ID 만으로는 흉내낼 수 있어서).
- 다른 기기면 `device_verification_required` → 가입한 휴대폰으로 문자 인증 → 이전 기기는 다음 서버 요청에서 `SESSION_REPLACED`.
- 인증번호: 유효 3분, 재발송 30초 간격, 5회 틀리면 처음부터, 하루 10회. TODO: 문자 업체 연동, 끊긴 기기에 푸시로 즉시 알림.

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

- 연락처로 친구 찾기(전화번호 해시), 근처 친구(위치 검색), 친구 삭제·차단
- 그룹·채팅 (WebSocket), 위치 수신 큐(Redis Stream) + worker, 비상 상황 판정 배치
- 파일 업로드 (S3 Presigned URL), 실제 로그인(소셜·SMS)은 마지막
