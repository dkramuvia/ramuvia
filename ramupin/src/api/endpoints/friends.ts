import { apiClient, mockResponse } from '../client';
import {
  mockContactSuggestions,
  mockFriendRequests,
  mockFriends,
  mockNearbySuggestions,
  mockSentRequests,
  mockShareSettings,
  mockUsers,
} from '../mock/data';
import { env } from '@/config/env';
import type { Friend, FriendRequest, FriendShareSetting, FriendSuggestion, UserSummary } from '@/types/models';

export const friendsApi = {
  async list(): Promise<Friend[]> {
    if (env.useMock) return mockResponse(mockFriends);
    const { data } = await apiClient.get<Friend[]>('/friends');
    return data;
  },

  async requests(): Promise<{ received: FriendRequest[]; sent: FriendRequest[] }> {
    if (env.useMock) return mockResponse({ received: mockFriendRequests, sent: mockSentRequests });
    const { data } = await apiClient.get('/friends/requests');
    return data;
  },

  async getRequest(requestId: string): Promise<FriendRequest> {
    if (env.useMock) {
      const request = [...mockFriendRequests, ...mockSentRequests].find((r) => r.id === requestId);
      if (!request) throw new Error(`request not found: ${requestId}`);
      return mockResponse(request);
    }
    const { data } = await apiClient.get<FriendRequest>(`/friends/requests/${requestId}`);
    return data;
  },

  /** 사용자 ID 또는 QR 코드로 사용자 찾기 */
  async findUser(userId: string): Promise<UserSummary | null> {
    if (env.useMock) return mockResponse(mockUsers.find((u) => u.id === userId) ?? null);
    const { data } = await apiClient.get<UserSummary | null>(`/users/${encodeURIComponent(userId)}`);
    return data;
  },

  async sendRequest(userId: string): Promise<void> {
    if (env.useMock) {
      [...mockContactSuggestions, ...mockNearbySuggestions]
        .filter((s) => s.user.id === userId)
        .forEach((s) => (s.requested = true));
      return mockResponse(undefined);
    }
    await apiClient.post('/friends/requests', { userId });
  },

  /**
   * 친구 요청 수락/거절.
   * 서버는 첫 친구가 생겨 1인 가구 모드 해제 대상이면 알려줍니다 (WBS 4: 75세 이상은 해제하지 않음)
   */
  async respond(requestId: string, accept: boolean): Promise<{ singleHouseholdReleasable: boolean }> {
    if (env.useMock) {
      const index = mockFriendRequests.findIndex((r) => r.id === requestId);
      if (index >= 0) mockFriendRequests.splice(index, 1);
      return mockResponse({ singleHouseholdReleasable: false });
    }
    const { data } = await apiClient.post(`/friends/requests/${requestId}/${accept ? 'accept' : 'reject'}`);
    return data;
  },

  async cancelRequest(requestId: string): Promise<void> {
    if (env.useMock) {
      const index = mockSentRequests.findIndex((r) => r.id === requestId);
      if (index >= 0) mockSentRequests.splice(index, 1);
      return mockResponse(undefined);
    }
    await apiClient.delete(`/friends/requests/${requestId}`);
  },

  /**
   * 주소록 전화번호로 라무핀 사용자 찾기.
   * TODO(5단계): 전화번호 원문 대신 해시를 보내도록 서버와 합의 (개인정보)
   */
  async matchContacts(phoneNumbers: string[]): Promise<FriendSuggestion[]> {
    if (env.useMock) return mockResponse(mockContactSuggestions, 800);
    const { data } = await apiClient.post<FriendSuggestion[]>('/friends/contact-matches', { phoneNumbers });
    return data;
  },

  /** 근처에 있는 라무핀 사용자 (위치를 숨김/비공개로 설정한 사용자는 제외) */
  async nearby(): Promise<FriendSuggestion[]> {
    if (env.useMock) return mockResponse(mockNearbySuggestions, 1200);
    const { data } = await apiClient.get<FriendSuggestion[]>('/friends/nearby');
    return data;
  },

  async getShareSetting(friendId: string): Promise<FriendShareSetting> {
    if (env.useMock) {
      return mockResponse(
        mockShareSettings[friendId] ?? {
          friendId,
          locationLevel: 'hidden',
          showStatus: false,
          shareRoute: false,
          shareBattery: false,
        },
      );
    }
    const { data } = await apiClient.get<FriendShareSetting>(`/friends/${friendId}/share-setting`);
    return data;
  },

  async saveShareSetting(setting: FriendShareSetting): Promise<void> {
    if (env.useMock) {
      mockShareSettings[setting.friendId] = setting;
      return mockResponse(undefined);
    }
    await apiClient.put(`/friends/${setting.friendId}/share-setting`, setting);
  },
};
