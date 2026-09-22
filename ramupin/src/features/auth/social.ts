import * as AuthSession from 'expo-auth-session';

import { env } from '@/config/env';

/**
 * 브라우저로 여는 소셜 로그인 (X · 네이버 · 구글).
 *
 * **셋 다 같은 방식입니다.** 앱은 브라우저에서 **인가 코드(code)만** 받아 오고,
 * 토큰 교환은 서버가 합니다. 앱이 받은 토큰을 그냥 서버에 건네면 남의 앱에서 받은
 * 토큰으로도 로그인할 수 있어서, 교환을 서버가 직접 해야 그것을 막을 수 있습니다.
 *
 * 제공자마다 다른 점은 두 가지뿐입니다.
 *   - **X·구글**: PKCE (code_verifier). secret 이 아예 없습니다
 *   - **네이버**: PKCE 를 지원하지 않아 서버가 client secret 으로 교환합니다.
 *     대신 `state` 로 "내가 시작한 로그인이 맞는지" 를 확인합니다
 */

/** 사용자가 로그인 창을 닫았을 때. 오류 메시지를 띄우지 않기 위해 따로 구분합니다 */
export class SocialAuthCancelled extends Error {
  constructor() {
    super('cancelled');
  }
}

export interface CodeAuthResult {
  code: string;
  /** PKCE 를 쓰는 제공자(X·구글)에서만 */
  codeVerifier?: string;
  /** 네이버에서만 */
  state?: string;
  redirectUri: string;
}

/* ─── X ─────────────────────────────────────────────────────────── */

const X_DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://x.com/i/oauth2/authorize',
  tokenEndpoint: 'https://api.x.com/2/oauth2/token',
};

/**
 * X 개발자 포털 > User authentication settings > Callback URI 에 **똑같이** 등록해야 합니다.
 * 하나라도 다르면 X 가 로그인 창에서 거부합니다.
 */
export const X_REDIRECT_URI = AuthSession.makeRedirectUri({ scheme: 'ramupin', path: 'x-auth' });

export function signInWithX(): Promise<CodeAuthResult> {
  if (!env.auth.xClientId) throw new Error('EXPO_PUBLIC_X_CLIENT_ID 가 없습니다');
  return promptForCode({
    label: 'x',
    discovery: X_DISCOVERY,
    clientId: env.auth.xClientId,
    redirectUri: X_REDIRECT_URI,
    // 프로필을 읽는 최소 권한만 요청합니다
    scopes: ['users.read', 'tweet.read'],
    usePKCE: true,
  });
}

/* ─── 네이버 ────────────────────────────────────────────────────── */

const NAVER_DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://nid.naver.com/oauth2.0/authorize',
  tokenEndpoint: 'https://nid.naver.com/oauth2.0/token',
};

/** 네이버 개발자센터 > 애플리케이션 > API 설정 > 서비스 URL·Callback URL 에 등록 */
export const NAVER_REDIRECT_URI = AuthSession.makeRedirectUri({ scheme: 'ramupin', path: 'naver-auth' });

/**
 * 네이버 로그인.
 *
 * 노인 무료 등급을 판단할 **출생연도**를 받아 오는 것이 이 로그인의 핵심입니다 (WBS 3.6).
 * 네이버 개발자센터에서 "출생연도" 를 **필수 동의 항목**으로 켜 두어야 실제로 옵니다.
 */
export function signInWithNaver(): Promise<CodeAuthResult> {
  if (!env.auth.naverClientId) throw new Error('EXPO_PUBLIC_NAVER_LOGIN_CLIENT_ID 가 없습니다');
  return promptForCode({
    label: 'naver',
    discovery: NAVER_DISCOVERY,
    clientId: env.auth.naverClientId,
    redirectUri: NAVER_REDIRECT_URI,
    scopes: [],
    // 네이버는 PKCE 를 지원하지 않습니다. 대신 state 로 확인합니다
    usePKCE: false,
  });
}

/* ─── 구글 ──────────────────────────────────────────────────────── */

const GOOGLE_DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};

/**
 * 구글은 안드로이드 클라이언트에 **되돌아올 주소를 직접 정하지 못하게** 합니다.
 * 클라이언트 ID 를 뒤집은 것이 곧 주소입니다 (`com.googleusercontent.apps.<ID>:/oauth`).
 */
export const GOOGLE_REDIRECT_URI = reversedClientIdUri(env.auth.googleClientId);

export function signInWithGoogle(): Promise<CodeAuthResult> {
  if (!env.auth.googleClientId) throw new Error('EXPO_PUBLIC_GOOGLE_CLIENT_ID 가 없습니다');
  return promptForCode({
    label: 'google',
    discovery: GOOGLE_DISCOVERY,
    clientId: env.auth.googleClientId,
    redirectUri: GOOGLE_REDIRECT_URI,
    // 이름·프로필 사진만 받습니다. 구글은 생년월일을 이 범위로 주지 않습니다
    scopes: ['openid', 'profile', 'email'],
    usePKCE: true,
  });
}

/** `1234-abc.apps.googleusercontent.com` → `com.googleusercontent.apps.1234-abc:/oauth` */
function reversedClientIdUri(clientId: string): string {
  const id = clientId.replace(/\.apps\.googleusercontent\.com$/, '');
  return id ? `com.googleusercontent.apps.${id}:/oauth` : '';
}

/* ─── 공통 ──────────────────────────────────────────────────────── */

interface PromptOptions {
  label: string;
  discovery: AuthSession.DiscoveryDocument;
  clientId: string;
  redirectUri: string;
  scopes: string[];
  usePKCE: boolean;
}

async function promptForCode({ label, discovery, clientId, redirectUri, scopes, usePKCE }: PromptOptions): Promise<CodeAuthResult> {
  const request = new AuthSession.AuthRequest({
    clientId,
    redirectUri,
    scopes,
    usePKCE,
    responseType: AuthSession.ResponseType.Code,
  });

  if (__DEV__) {
    console.log(`[${label}] redirectUri =`, redirectUri);
    console.log(`[${label}] authUrl =`, await request.makeAuthUrlAsync(discovery));
  }

  const result = await request.promptAsync(discovery);

  if (result.type === 'cancel' || result.type === 'dismiss') throw new SocialAuthCancelled();
  if (result.type !== 'success') {
    throw new Error(result.type === 'error' ? (result.error?.message ?? `${label} 로그인 오류`) : `${label} 로그인 실패`);
  }

  // 다른 사이트가 우리 로그인 흐름에 남의 코드를 끼워 넣는 것을 막는 장치입니다.
  // expo-auth-session 이 state 를 만들어 보내므로, 돌아온 값이 같은지 여기서 확인합니다
  if (result.params.state && result.params.state !== request.state) {
    throw new Error(`${label} 로그인 응답이 올바르지 않습니다`);
  }
  if (usePKCE && !request.codeVerifier) throw new Error('code_verifier 가 만들어지지 않았습니다');

  return {
    code: result.params.code,
    ...(usePKCE ? { codeVerifier: request.codeVerifier } : {}),
    ...(result.params.state ? { state: result.params.state } : {}),
    redirectUri,
  };
}
