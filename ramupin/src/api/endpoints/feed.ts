import { apiClient, mockResponse } from '../client';
import { mockFeed } from '../mock/data';
import { env } from '@/config/env';
import type { FeedItem } from '@/types/models';

/** 지도 메인 바텀시트의 알림·상호작용 기록 */
export const feedApi = {
  async list(): Promise<FeedItem[]> {
    if (env.useMock) return mockResponse(mockFeed);
    const { data } = await apiClient.get<FeedItem[]>('/feed');
    return data;
  },
};
