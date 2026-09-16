import { initializeKakaoSDK } from '@react-native-kakao/core';
import { login, logout, unlink } from '@react-native-kakao/user';

import { env } from '@/config/env';

/**
 * 카카오 로그인 (앱 쪽).
 * 카카오톡이 깔려 있으면 카카오톡으로, 없으면 카카오계정 웹 로그인으로 진행됩니다.
 * 여기서 받은 access token 을 서버(`POST /auth/kakao`)가 카카오에 확인합니다.
 */
let initialized = false;

function ensureInitialized() {
  if (initialized) return;
  if (!env.auth.kakaoNativeAppKey) throw new Error('EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY 가 없습니다');
  initializeKakaoSDK(env.auth.kakaoNativeAppKey);
  initialized = true;
}

export async function signInWithKakao(): Promise<string> {
  ensureInitialized();
  const token = await login();
  return token.accessToken;
}

/** 로그아웃·탈퇴 시 카카오 쪽 연결도 정리 */
export async function signOutFromKakao(): Promise<void> {
  if (!initialized) return;
  await logout().catch(() => undefined);
}

export async function unlinkKakao(): Promise<void> {
  ensureInitialized();
  await unlink();
}
