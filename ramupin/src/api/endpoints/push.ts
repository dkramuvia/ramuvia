import { apiClient } from '../client';

/** 푸시 토큰 등록 (WBS 6단계). 기기마다 하나씩, 로그아웃하면 지웁니다 */
export const pushApi = {
  async register(token: string, platform: string): Promise<void> {
    await apiClient.post('/me/push-tokens', { token, platform });
  },

  async unregister(token: string): Promise<void> {
    await apiClient.delete('/me/push-tokens', { data: { token } });
  },
};
