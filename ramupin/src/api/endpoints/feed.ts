import { apiClient, mockResponse } from '../client';
import { mockFeed } from '../mock/data';
import { isLive } from '@/config/env';
import type { FeedItem } from '@/types/models';

/**
 * 지도 메인 바텀시트의 활동 기록 (WBS 9.7).
 *
 * 서버가 **이미 남기고 있는 기록에서 모아** 돌려줍니다 — 안심장소 출입, 내 위치를 본
 * 사람, 오래 머무는 친구. 피드용 표를 따로 쌓지 않습니다.
 */
export const feedApi = {
  async list(): Promise<FeedItem[]> {
    if (!isLive('friends')) return mockResponse(mockFeed);
    const { data } = await apiClient.get<FeedItem[]>('/feed');
    return data;
  },
};
