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
  JWT_EXPIRES_IN: z.string().default('30d'),
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
