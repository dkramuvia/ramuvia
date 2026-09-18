import * as AuthSession from 'expo-auth-session';

import { env } from '@/config/env';

/**
 * X(트위터) 로그인 (앱 쪽).
 *
 * 카카오와 방식이 다릅니다. 카카오는 앱이 access token 까지 받아서 서버에 보냈지만,
 * X 는 **인가 코드(code)만** 받아 오고 토큰 교환은 서버가 합니다.
 * X 가 "이 토큰이 우리 앱 것인지" 확인할 방법을 주지 않아서, 교환을 서버가 직접 해야
 * 남의 앱 토큰으로 로그인하는 것을 막을 수 있습니다 (서버 x.service.ts 설명 참고).
 *
 * PKCE 를 쓰므로 client secret 은 앱에도 서버에도 넣지 않습니다.
 */

const DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://x.com/i/oauth2/authorize',
  tokenEndpoint: 'https://api.x.com/2/oauth2/token',
};

/** 프로필을 읽는 최소 권한만 요청합니다 */
const SCOPES = ['users.read', 'tweet.read'];

/**
 * X 개발자 포털 > User authentication settings > Callback URI 에 **똑같이** 등록해야 합니다.
 * 하나라도 다르면 X 가 로그인 창에서 거부합니다.
 */
export const X_REDIRECT_URI = AuthSession.makeRedirectUri({ scheme: 'ramupin', path: 'x-auth' });

export interface XAuthResult {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}

/** 사용자가 창을 닫았을 때 */
export class XAuthCancelled extends Error {
  constructor() {
    super('cancelled');
  }
}

/**
 * X 로그인 창을 열고 인가 코드를 받아 옵니다.
 * 받은 값은 그대로 서버(`POST /auth/x`)로 보냅니다.
 */
export async function signInWithX(): Promise<XAuthResult> {
  if (!env.auth.xClientId) throw new Error('EXPO_PUBLIC_X_CLIENT_ID 가 없습니다');

  const request = new AuthSession.AuthRequest({
    clientId: env.auth.xClientId,
    redirectUri: X_REDIRECT_URI,
    scopes: SCOPES,
    usePKCE: true,
    responseType: AuthSession.ResponseType.Code,
  });

  if (__DEV__) {
    const url = await request.makeAuthUrlAsync(DISCOVERY);
    console.log('[x] redirectUri =', X_REDIRECT_URI);
    console.log('[x] authUrl =', url);
  }

  const result = await request.promptAsync(DISCOVERY);

  if (result.type === 'cancel' || result.type === 'dismiss') throw new XAuthCancelled();
  if (result.type !== 'success') {
    throw new Error(result.type === 'error' ? (result.error?.message ?? 'X 로그인 오류') : 'X 로그인 실패');
  }
  if (!request.codeVerifier) throw new Error('code_verifier 가 만들어지지 않았습니다');

  return { code: result.params.code, codeVerifier: request.codeVerifier, redirectUri: X_REDIRECT_URI };
}
