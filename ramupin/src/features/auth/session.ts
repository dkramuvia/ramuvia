import type { AxiosError } from 'axios';

import { setUnauthorizedHandler } from '@/api/client';
import { authApi, authErrorOf, type LoginResult } from '@/api/endpoints/auth';
import { usersApi } from '@/api/endpoints/users';
import { queryClient } from '@/api/queryClient';
import { getDb } from '@/db';
import { useAuthStore, type SessionEndReason } from '@/stores/authStore';
import { useSignUpStore } from '@/stores/signUpStore';
import { secureStorage } from './secureStorage';

/**
 * 로그인 세션 (기기 1대 로그인 규칙).
 * - access token: 메모리(authStore), 1시간. 만료되면 refresh token 으로 자동 갱신
 * - refresh token·기기 키: 보안 저장소
 * - 다른 기기에서 로그인하면 서버가 SESSION_REPLACED → 로그아웃하고 안내 팝업
 */

export type LoginOutcome = 'signed-in' | 'device-verification' | 'sign-up';

/** 로그인 API 결과 반영. 문자 인증이나 가입이 필요하면 화면에서 그쪽으로 보냅니다 */
export async function applyLoginResult(result: LoginResult): Promise<LoginOutcome> {
  const store = useAuthStore.getState();
  if (result.status === 'device_verification_required') {
    store.setPendingDeviceVerification({ challengeId: result.challengeId });
    return 'device-verification';
  }
  if (result.status === 'sign_up_required') {
    useSignUpStore.getState().set({ signUpToken: result.signUpToken, nickname: result.suggestedNickname ?? '' });
    return 'sign-up';
  }
  await secureStorage.set('refreshToken', result.refreshToken);
  await secureStorage.set('deviceKey', result.deviceKey);
  useAuthStore.setState({ accessToken: result.accessToken });
  const user = await usersApi.me();
  store.signIn(result.accessToken, user);
  store.completeOnboarding();
  useSignUpStore.getState().reset();
  return 'signed-in';
}

/** 앱 시작 시 저장된 refresh token 으로 로그인 복원. 복원했으면 true */
export async function restoreSession(): Promise<boolean> {
  if (!(await secureStorage.get('refreshToken'))) return false;
  const token = await refreshAccessToken();
  if (!token) return false;
  const user = await usersApi.me();
  const store = useAuthStore.getState();
  store.signIn(token, user);
  store.completeOnboarding();
  return true;
}

let refreshing: Promise<string | null> | null = null;

/** access token 갱신 (동시에 여러 요청이 401 을 받아도 한 번만). 세션이 끊겼으면 로그아웃하고 null */
export function refreshAccessToken(): Promise<string | null> {
  refreshing ??= (async () => {
    try {
      const refreshToken = await secureStorage.get('refreshToken');
      if (!refreshToken) {
        await endSession('expired');
        return null;
      }
      const tokens = await authApi.refresh(refreshToken);
      await secureStorage.set('refreshToken', tokens.refreshToken);
      useAuthStore.setState({ accessToken: tokens.accessToken });
      return tokens.accessToken;
    } catch (error) {
      const code = authErrorOf(error)?.code;
      if (code === 'SESSION_REPLACED') await endSession('replaced');
      else if (code === 'SESSION_REVOKED') await endSession('revoked');
      else if (code === 'REFRESH_INVALID' || code === 'REFRESH_EXPIRED') await endSession('expired');
      // 네트워크 오류 등은 로그인을 유지하고 다음 요청에서 다시 시도
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/**
 * 로그인 끊기: 토큰·내 데이터 캐시·위치 대기열을 지웁니다.
 * 설치 ID·기기 키는 남겨서, 같은 기기로 다시 로그인하면 문자 인증을 받지 않게 합니다
 * (단, 다른 기기가 그 사이 로그인했다면 서버가 인증을 요구).
 */
export async function endSession(reason: SessionEndReason | 'logout') {
  await secureStorage.remove('refreshToken').catch(() => undefined);
  try {
    // 다른 계정으로 로그인했을 때 이전 계정 위치가 올라가지 않도록
    await getDb().runAsync('DELETE FROM location_outbox');
  } catch (error) {
    console.warn('[session] 위치 대기열 삭제 실패', String(error));
  }
  queryClient.clear();
  useAuthStore.getState().signOut(reason === 'logout' ? undefined : reason);
}

/** 설정 > 로그아웃 */
export async function logout() {
  try {
    await authApi.logout();
  } catch {
    // 서버에 못 알려도 기기에서는 로그아웃 (세션은 서버에서 다음 로그인 때 교체됨)
  }
  await endSession('logout');
}

setUnauthorizedHandler(async (error: AxiosError<{ code?: string }>) => {
  const code = error.response?.data?.code;
  // 이미 로그아웃된 뒤 늦게 도착한 응답이면 무시
  if (!useAuthStore.getState().accessToken) return null;
  if (code === 'TOKEN_EXPIRED') return refreshAccessToken();
  if (code === 'SESSION_REPLACED') await endSession('replaced');
  else if (code === 'SESSION_REVOKED') await endSession('revoked');
  else await endSession('expired');
  return null;
});
