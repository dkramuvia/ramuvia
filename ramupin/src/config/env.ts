/**
 * 연동 정보가 모이는 곳.
 * 값은 프로젝트 루트의 .env 에서 읽습니다 (.env.example 참고).
 * 앱 코드에서는 process.env 를 직접 쓰지 말고 항상 이 파일의 env 를 사용하세요.
 */

/** 서버에 연결할 수 있는 기능 이름. 서버 API 가 준비된 것부터 하나씩 추가합니다 */
export type ServerFeature = 'auth' | 'me' | 'policy' | 'friends' | 'location' | 'groups' | 'chat' | 'places' | 'gallery' | 'sos' | 'geofence' | 'weather';

const useMock = process.env.EXPO_PUBLIC_USE_MOCK !== 'false';
const serverFeatures = new Set(
  (process.env.EXPO_PUBLIC_SERVER_FEATURES ?? '')
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean),
);

export const env = {
  useMock,
  /** 개발용: 가입/로그인 없이 바로 앱에 들어감 (서버 연결 시 서버의 개발용 로그인 사용) */
  devSkipAuth: __DEV__ && process.env.EXPO_PUBLIC_DEV_SKIP_AUTH !== 'false',
  /** 개발용 로그인에 쓸 테스트 사용자 8자리 ID (서버 npm run db:seed) */
  devLoginPublicId: process.env.EXPO_PUBLIC_DEV_LOGIN_PUBLIC_ID ?? '26467878',

  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? '',
  /** 실시간(WebSocket) 주소. 없으면 API 주소를 그대로 사용 */
  wsUrl: process.env.EXPO_PUBLIC_WS_URL || (process.env.EXPO_PUBLIC_API_BASE_URL ?? ''),

  auth: {
    /** 카카오 디벨로퍼스 RamuPin(1578376) 네이티브 앱 키. app.config.ts 에서 네이티브 설정에도 씁니다 */
    kakaoNativeAppKey: process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY ?? '',
    /** 구글 로그인 OAuth 클라이언트 ID (안드로이드용). Google Cloud 콘솔에서 발급 */
    googleClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '',
    /** 네이버 로그인 Client ID. 지도 키와 다른 앱입니다 (Secret 은 서버에만) */
    naverClientId: process.env.EXPO_PUBLIC_NAVER_LOGIN_CLIENT_ID ?? '',
    /**
     * 네이버가 로그인을 마치고 돌아올 주소.
     *
     * 네이버는 `ramupin://` 같은 앱 주소를 받지 않아 우리 서버로 먼저 보냅니다.
     * **네이버 개발자센터에 등록한 것과 글자 하나까지 같아야** 합니다.
     * 비워 두면 API 주소 뒤에 붙여 쓰지만, 개발 중에는 대개 따로 적어야 합니다
     * (네이버가 127.0.0.1 을 받지 않아 localhost 로 등록하게 되기 때문).
     */
    naverCallbackUrl: process.env.EXPO_PUBLIC_NAVER_CALLBACK_URL ?? '',
    facebookAppId: process.env.EXPO_PUBLIC_FACEBOOK_APP_ID ?? '',
    xClientId: process.env.EXPO_PUBLIC_X_CLIENT_ID ?? '',
  },

  map: {
    // Google Maps 키는 app.config.ts 에서 네이티브 설정으로만 주입합니다 (GOOGLE_MAPS_ANDROID_API_KEY)
    naverClientId: process.env.EXPO_PUBLIC_NAVER_MAP_CLIENT_ID ?? '',
    mapboxAccessToken: process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '',
  },

  ads: {
    admobAndroidAppId: process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID ?? '',
  },
} as const;

/**
 * 이 기능을 실제 서버로 호출할지.
 * - EXPO_PUBLIC_USE_MOCK=false → 전부 서버
 * - EXPO_PUBLIC_USE_MOCK=true + EXPO_PUBLIC_SERVER_FEATURES=me,friends → 적힌 기능만 서버, 나머지는 목업
 */
export function isLive(feature: ServerFeature): boolean {
  return !useMock || serverFeatures.has(feature);
}
