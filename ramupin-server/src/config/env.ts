import { z } from 'zod';

// PC 개발: 프로젝트 루트의 .env 를 읽습니다. 컨테이너에서는 환경변수가 이미 들어와 있어 덮어쓰지 않습니다.
try {
  process.loadEnvFile('.env');
} catch {
  // .env 가 없으면 환경변수만 사용
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().default(3000),
  MAIN_DATABASE_URL: z.string().url(),
  // ★ 위치 DB 를 다른 서버로 옮길 때 이 값만 바꿉니다
  LOCATION_DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET 은 32자 이상'),
  // access token 은 짧게: 기기 교체·로그아웃이 늦어도 이 시간 안에는 반영됨 (가드가 세션도 매번 확인)
  JWT_EXPIRES_IN: z.string().default('1h'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(60),
  /**
   * 문자 발송 업체.
   *   dev    — 실제로 보내지 않고 서버 로그에만 남깁니다. 인증번호는 123456 고정
   *   aligo  — 알리고 (https://smartsms.aligo.in)
   */
  SMS_PROVIDER: z.enum(['dev', 'aligo']).default('dev'),
  /**
   * 알리고 로그인 아이디 (Identifier).
   * 알리고 관리자 화면에 적힌 **아이디** 그대로입니다.
   */
  ALIGO_USER_ID: z.string().default(''),
  /**
   * 알리고 API 발급키.
   *
   * **비밀값입니다.** 저장소에 올리지 말고, 앱에도 넣지 마세요.
   * 앱에 넣은 키는 공개된 키입니다 — 누구나 그 키로 문자를 보낼 수 있고 요금은 우리가 냅니다.
   */
  ALIGO_API_KEY: z.string().default(''),
  /**
   * 발신번호. **알리고에 미리 등록한 번호만** 쓸 수 있습니다 (전기통신사업법).
   * 등록하지 않은 번호로 보내면 업체가 거절합니다.
   */
  ALIGO_SENDER: z.string().default(''),
  /**
   * 테스트 모드 (`Y`). 요금이 나가지 않고 실제 문자도 가지 않지만
   * 나머지는 실제와 똑같이 동작합니다. 붙일 때 이걸로 먼저 확인하세요.
   */
  ALIGO_TEST_MODE: z.enum(['Y', 'N']).default('N'),
  /**
   * **개발 중에 문자를 받아도 되는 번호 목록** (쉼표로 구분).
   *
   * 씨드 계정에는 지어낸 번호가 들어 있습니다. 운영이 아닌 곳에서 `aligo` 를 켜면
   * 확인 스크립트가 그 번호로 **실제 문자를 보내 버립니다.** 지어낸 번호는
   * 모르는 사람의 번호일 수 있고 요금도 나갑니다.
   * 그래서 운영이 아닌 곳에서는 여기 적은 번호로만 나갑니다.
   */
  ALIGO_ALLOW_NUMBERS: z.string().default(''),
  // 카카오 로그인: 받은 토큰이 이 앱(RamuPin)에서 발급된 것인지 확인
  KAKAO_APP_ID: z.coerce.number().int().positive(),
  /** X(트위터) OAuth 2.0 Client ID. 공개 클라이언트(PKCE)라 secret 은 쓰지 않습니다 */
  X_CLIENT_ID: z.string().min(10).default(''),
  /**
   * 네이버 로그인 (지도 키와 다른 앱입니다 — 네이버 개발자센터에서 따로 등록).
   * 네이버는 PKCE 를 지원하지 않아 secret 이 필요하고, 그래서 토큰 교환은 서버에서만 합니다
   */
  NAVER_LOGIN_CLIENT_ID: z.string().default(''),
  NAVER_LOGIN_CLIENT_SECRET: z.string().default(''),
  /** 구글 로그인 OAuth 클라이언트. 안드로이드 클라이언트는 공개 클라이언트라 secret 이 없습니다 */
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  /** Firebase 서비스 계정 키 파일 경로 (푸시 발송용). 없으면 발송을 건너뜁니다 */
  FIREBASE_SERVICE_ACCOUNT_FILE: z.string().default(''),
  // 네이버 지도 REST (주소 검색·좌표→주소). 앱에는 Client ID 만 들어가고 Secret 은 서버 전용
  NAVER_MAP_CLIENT_ID: z.string().default(''),
  NAVER_MAP_CLIENT_SECRET: z.string().default(''),
  // 전화번호 암호화·중복 확인 키 (32바이트 base64). 바뀌면 기존 번호를 읽지 못함
  // 사진·동영상 저장소. 개발은 Docker MinIO, 운영은 AWS S3 — 규격이 같아 주소·키만 바뀝니다
  STORAGE_ENDPOINT: z.string().url().default(''),
  STORAGE_BUCKET: z.string().default('ramupin-media'),
  STORAGE_ACCESS_KEY: z.string().default(''),
  STORAGE_SECRET_KEY: z.string().default(''),
  /** 앱이 파일을 주고받을 때 쓸 주소. 비우면 STORAGE_ENDPOINT 를 씁니다 */
  STORAGE_PUBLIC_URL: z.string().default(''),
  /**
   * 공유 링크에 붙는 주소 (사진 공유, WBS 6).
   * 이 주소로 열리는 웹 페이지는 아직 없습니다 — 링크 발급과 서버 조회만 먼저 만들어 둡니다
   */
  PUBLIC_WEB_URL: z.string().default('https://ramupin.app'),
  /**
   * 위치 이력 보관 개월 수 (WBS 4.3: 6개월).
   *
   * 법무 확인 결과에 따라 바뀔 수 있어 환경변수로 뺍니다. 코드를 고치지 않고 조정합니다.
   * 0 이면 파기 배치를 돌리지 않습니다 (개발 중 실수로 지우지 않도록).
   */
  LOCATION_KEEP_MONTHS: z.coerce.number().int().min(0).max(120).default(6),
  PHONE_ENC_KEY: z.string().min(40),
  PHONE_HASH_KEY: z.string().min(40),
  DEV_LOGIN_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('환경변수 설정 오류:', z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;

if (env.NODE_ENV === 'production' && env.DEV_LOGIN_ENABLED) {
  console.error('운영 환경에서는 DEV_LOGIN_ENABLED=false 여야 합니다');
  process.exit(1);
}

if (env.SMS_PROVIDER === 'aligo' && !(env.ALIGO_USER_ID && env.ALIGO_API_KEY && env.ALIGO_SENDER)) {
  // 여기서 막지 않으면 인증번호가 조용히 안 가고, 사용자는 "문자가 안 와요" 만 겪습니다
  throw new Error('SMS_PROVIDER=aligo 인데 ALIGO_USER_ID / ALIGO_API_KEY / ALIGO_SENDER 중 빠진 값이 있습니다');
}

if (env.SMS_PROVIDER === 'aligo' && env.NODE_ENV !== 'production' && !env.ALIGO_ALLOW_NUMBERS.trim()) {
  // 비워 두면 "아무 번호나 허용" 이 되어, 씨드의 지어낸 번호로 모르는 사람에게 문자가 갑니다.
  // 안전한 쪽이 기본이 되도록 아예 시작을 막습니다
  throw new Error(
    'SMS_PROVIDER=aligo 로 개발하려면 ALIGO_ALLOW_NUMBERS 에 문자를 받을 번호를 적어 주세요 ' +
      '(예: ALIGO_ALLOW_NUMBERS=01012345678). 씨드 계정의 지어낸 번호로 실제 문자가 나가는 것을 막기 위한 것입니다',
  );
}

if (env.NODE_ENV === 'production' && env.SMS_PROVIDER === 'dev') {
  console.error('운영 환경에서는 실제 문자 발송 업체(SMS_PROVIDER)를 설정해야 합니다');
  process.exit(1);
}
