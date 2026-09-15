/**
 * 연동 정보가 모이는 곳.
 * 값은 프로젝트 루트의 .env 에서 읽습니다 (.env.example 참고).
 * 앱 코드에서는 process.env 를 직접 쓰지 말고 항상 이 파일의 env 를 사용하세요.
 */
export const env = {
  useMock: process.env.EXPO_PUBLIC_USE_MOCK !== 'false',
  /** 개발용: 가입/로그인 없이 목업 사용자로 바로 앱에 들어감 (가입·로그인은 마지막 단계에서 연결) */
  devSkipAuth: __DEV__ && process.env.EXPO_PUBLIC_DEV_SKIP_AUTH !== 'false',

  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? '',
  wsUrl: process.env.EXPO_PUBLIC_WS_URL ?? '',

  auth: {
    googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
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
