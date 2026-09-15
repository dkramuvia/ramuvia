import axios from 'axios';

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

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    // TODO(4단계): 401 이면 refresh token 으로 재발급 후 재시도, 실패 시 로그아웃
    if (error.response?.status === 401) {
      useAuthStore.getState().signOut();
    }
    return Promise.reject(error);
  },
);

/** 목업 응답에 네트워크 지연을 흉내냅니다. */
export function mockResponse<T>(data: T, delayMs = 300): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(data), delayMs));
}
