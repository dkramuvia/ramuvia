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
  // 문자 발송: dev = 서버 로그에만 출력하고 인증번호 123456 고정. TODO: 대표님 계약 업체 연동
  SMS_PROVIDER: z.enum(['dev']).default('dev'),
  // 카카오 로그인: 받은 토큰이 이 앱(RamuPin)에서 발급된 것인지 확인
  KAKAO_APP_ID: z.coerce.number().int().positive(),
  // 전화번호 암호화·중복 확인 키 (32바이트 base64). 바뀌면 기존 번호를 읽지 못함
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

if (env.NODE_ENV === 'production' && env.SMS_PROVIDER === 'dev') {
  console.error('운영 환경에서는 실제 문자 발송 업체(SMS_PROVIDER)를 설정해야 합니다');
  process.exit(1);
}
