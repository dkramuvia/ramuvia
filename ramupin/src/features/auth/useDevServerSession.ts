import { useEffect, useState } from 'react';

import { authApi } from '@/api/endpoints/auth';
import { mockMe } from '@/api/mock/data';
import { env, isLive } from '@/config/env';
import { useAuthStore } from '@/stores/authStore';
import { getDeviceInput } from './device';
import { applyLoginResult, restoreSession, type LoginOutcome } from './session';

export type DevSessionState = 'idle' | 'connecting' | 'connected' | 'verify' | 'failed';

const TIMEOUT_MS = 6000;

/**
 * 개발용 서버 로그인 (시드 사용자 EXPO_PUBLIC_DEV_LOGIN_PUBLIC_ID).
 * 다른 기기에서 로그인한 계정이면 새 기기 문자 인증 화면으로 보냅니다. (true = 로그인 완료)
 */
export async function devServerLogin(): Promise<LoginOutcome> {
  const result = await authApi.devLogin(env.devLoginPublicId, await getDeviceInput());
  return applyLoginResult(result);
}

/** 서버에 연결하지 못했을 때 목업 사용자로 진행 */
function fallbackToMock() {
  const store = useAuthStore.getState();
  store.signIn('dev-token', mockMe);
  store.completeOnboarding();
}

/**
 * 개발 중 로그인 건너뛰기 + 서버 연결(auth) 이 켜져 있으면 앱 시작 시
 * 저장된 로그인을 복원하거나, 없으면 서버 개발용 로그인을 합니다.
 * 서버가 꺼져 있으면 목업 사용자로 진행합니다.
 * TODO(로그인 단계): 실제 로그인이 붙으면 복원만 남기고 개발용 로그인은 삭제
 */
export function useDevServerSession(): DevSessionState {
  const enabled = env.devSkipAuth && isLive('auth');
  const [state, setState] = useState<DevSessionState>(enabled ? 'connecting' : 'idle');

  useEffect(() => {
    if (!enabled) return;
    let finished = false;
    const finish = (next: DevSessionState) => {
      if (finished) return false;
      finished = true;
      setState(next);
      return true;
    };
    const timer = setTimeout(() => {
      if (finish('failed')) {
        console.warn(`[dev-session] 서버(${env.apiBaseUrl}) 응답 없음 → 목업 사용자로 진행`);
        fallbackToMock();
      }
    }, TIMEOUT_MS);

    (async () => {
      try {
        const outcome = (await restoreSession()) ? 'signed-in' : await devServerLogin();
        finish(outcome === 'signed-in' ? 'connected' : 'verify');
      } catch (error) {
        if (finish('failed')) {
          console.warn('[dev-session] 서버 개발용 로그인 실패 → 목업 사용자로 진행', String(error));
          fallbackToMock();
        }
      } finally {
        clearTimeout(timer);
      }
    })();

    return () => clearTimeout(timer);
  }, [enabled]);

  return state;
}
