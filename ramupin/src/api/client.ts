import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

import { env } from '@/config/env';
import { useAuthStore } from '@/stores/authStore';

export const apiClient = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 15_000,
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * 401 처리기. 순환 import 를 피하려고 features/auth/session.ts 가 등록합니다.
 * 새 access token 을 돌려주면 요청을 한 번 다시 보내고, null 이면 그대로 실패시킵니다.
 */
type UnauthorizedHandler = (error: AxiosError<{ code?: string }>) => Promise<string | null>;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler) {
  unauthorizedHandler = handler;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ code?: string }>) => {
    const config = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    // 개발용 목업 토큰(서버 연결 실패 시)은 서버가 거절해도 로그아웃하지 않습니다
    const isMockToken = useAuthStore.getState().accessToken === 'dev-token';
    // 로그인·refresh 요청 자체의 401 은 호출한 쪽에서 처리
    const isAuthRequest = config?.url?.startsWith('/auth/') ?? false;

    if (error.response?.status === 401 && config && !config._retried && !isMockToken && !isAuthRequest && unauthorizedHandler) {
      const token = await unauthorizedHandler(error);
      if (token) {
        config._retried = true;
        config.headers.Authorization = `Bearer ${token}`;
        return apiClient(config);
      }
    }
    return Promise.reject(error);
  },
);

/** 목업 응답에 네트워크 지연을 흉내냅니다. */
export function mockResponse<T>(data: T, delayMs = 300): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(data), delayMs));
}
