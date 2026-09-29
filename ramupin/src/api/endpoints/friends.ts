import { apiClient, mockResponse } from '../client';
import {
  mockContactSuggestions,
  mockFriendRequests,
  mockFriends,
  mockMe,
  mockNearbySuggestions,
  mockSentRequests,
  mockShareSettings,
  mockUsers,
} from '../mock/data';
import { isLive } from '@/config/env';
import type { FoundUser, Friend, FriendRequest, FriendShareSetting, FriendSuggestion, UserSummary } from '@/types/models';

/** 서버 응답은 없는 값이 null → 앱 모델은 undefined */
type Nullable<T> = { [K in keyof T]-?: undefined extends T[K] ? Exclude<T[K], undefined> | null : T[K] };

type FriendResponse = Nullable<Friend> & { publicId: string };

/** 친구별 맞춤 알림 (피그마 2026-09-28 "친구별 맞춤 알림 설정") */
export interface FriendAlertSettings {
  friendId: string;
  /** 배터리가 곧 방전될 때 */
  battery: boolean;
  /** 안심존에 들어가거나 나갈 때 */
  safeZone: boolean;
  /** 제한 속도를 넘어 이동 중일 때 (2단계 기능) */
  speeding: boolean;
  /** 내 반경 1km 안으로 들어왔을 때 */
  nearby: boolean;
}
type UserSummaryResponse = Nullable<UserSummary>;
type FriendRequestResponse = Omit<Nullable<FriendRequest>, 'from' | 'to'> & { from: UserSummaryResponse; to: UserSummaryResponse };

function toUserSummary(u: UserSummaryResponse): UserSummary {
  return {
    id: u.id,
    publicId: u.publicId ?? undefined,
    nickname: u.nickname,
    avatarUrl: u.avatarUrl ?? undefined,
    areaName: u.areaName ?? undefined,
    lastActiveAt: u.lastActiveAt ?? undefined,
  };
}

function toFriendRequest(r: FriendRequestResponse): FriendRequest {
  return { ...r, message: r.message ?? undefined, from: toUserSummary(r.from), to: toUserSummary(r.to) };
}

export type SendRequestResult = { requestId: string; status: 'pending' } | { requestId: string; status: 'accepted'; singleHouseholdReleasable: boolean };

/** 서버 친구 오류 코드 (ramupin-server src/friends, src/users) */
export type FriendErrorCode =
  | 'USER_NOT_FOUND'
  | 'CANNOT_REQUEST_SELF'
  | 'ALREADY_FRIENDS'
  | 'REQUEST_LIMIT'
  | 'LOOKUP_LIMIT'
  | 'REQUEST_NOT_FOUND'
  | 'REQUEST_NOT_PENDING'
  | 'NOT_FRIEND'
  /** QR 토큰이 만료됨 (3분) */
  | 'QR_EXPIRED';

export function friendErrorCode(error: unknown): FriendErrorCode | undefined {
  return (error as { response?: { data?: { code?: FriendErrorCode } } }).response?.data?.code;
}

export const friendsApi = {
  async list(): Promise<Friend[]> {
    if (!isLive('friends')) return mockResponse(mockFriends);
    const { data } = await apiClient.get<FriendResponse[]>('/friends');
    return data.map((f) => ({
      ...f,
      avatarUrl: f.avatarUrl ?? undefined,
      batteryLevel: f.batteryLevel ?? undefined,
      location: f.location ?? undefined,
      speedKmh: f.speedKmh ?? undefined,
      stayedSince: f.stayedSince ?? undefined,
      isOnline: f.isOnline ?? undefined,
    }));
  },

  async requests(): Promise<{ received: FriendRequest[]; sent: FriendRequest[] }> {
    if (!isLive('friends')) return mockResponse({ received: mockFriendRequests, sent: mockSentRequests });
    const { data } = await apiClient.get<{ received: FriendRequestResponse[]; sent: FriendRequestResponse[] }>('/friends/requests');
    return { received: data.received.map(toFriendRequest), sent: data.sent.map(toFriendRequest) };
  },

  async getRequest(requestId: string): Promise<FriendRequest> {
    if (!isLive('friends')) {
      const request = [...mockFriendRequests, ...mockSentRequests].find((r) => r.id === requestId);
      if (!request) throw new Error(`request not found: ${requestId}`);
      return mockResponse(request);
    }
    const { data } = await apiClient.get<FriendRequestResponse>(`/friends/requests/${requestId}`);
    return toFriendRequest(data);
  },

  /** 8자리 사용자 ID(ID 입력·QR)로 사용자 찾기. 없으면 null */
  async findUser(publicId: string): Promise<FoundUser | null> {
    if (!isLive('friends')) {
      const user = mockUsers.find((u) => u.id === publicId);
      if (publicId === mockMe.publicId) return mockResponse({ id: mockMe.id, nickname: mockMe.nickname, relation: 'self' });
      return mockResponse(user ? { ...user, relation: 'none' } : null);
    }
    try {
      const { data } = await apiClient.get<UserSummaryResponse & { relation: FoundUser['relation'] }>('/users/lookup', { params: { publicId } });
      return { ...toUserSummary(data), relation: data.relation };
    } catch (error) {
      const code = friendErrorCode(error);
      // 형식이 틀린 ID(400)도 "찾을 수 없음"으로 보여줌
      if (code === 'USER_NOT_FOUND' || (error as { response?: { status?: number } }).response?.status === 400) return null;
      throw error;
    }
  },

  /** 이 친구의 어떤 소식을 받을지 (피그마 2026-09-28 친구별 맞춤 알림) */
  async alerts(friendId: string): Promise<FriendAlertSettings> {
    if (!isLive('friends')) return mockResponse({ friendId, battery: true, safeZone: true, speeding: false, nearby: false });
    const { data } = await apiClient.get<FriendAlertSettings>(`/friends/${friendId}/alerts`);
    return data;
  },

  async saveAlerts(friendId: string, patch: Partial<Omit<FriendAlertSettings, 'friendId'>>): Promise<FriendAlertSettings> {
    if (!isLive('friends')) return mockResponse({ friendId, battery: true, safeZone: true, speeding: false, nearby: false, ...patch });
    const { data } = await apiClient.put<FriendAlertSettings>(`/friends/${friendId}/alerts`, patch);
    return data;
  },

  /** 내 QR 에 넣을 일회용 토큰 (WBS 3.6). 3분 뒤 만료되므로 화면에서 주기적으로 다시 받습니다 */
  async qrToken(): Promise<{ token: string; expiresInSec: number }> {
    if (!isLive('friends')) return mockResponse({ token: `mock-${mockMe.publicId}`, expiresInSec: 180 });
    const { data } = await apiClient.post<{ token: string; expiresInSec: number }>('/friends/qr-token');
    return data;
  },

  /** QR 토큰으로 상대 찾기. 읽는 것만으로는 토큰이 사라지지 않습니다 */
  async findByQr(token: string): Promise<FoundUser | null> {
    if (!isLive('friends')) {
      const user = mockUsers.find((u) => `mock-${u.id}` === token) ?? mockUsers[0];
      return mockResponse(user ? { ...user, relation: 'none' } : null);
    }
    try {
      const { data } = await apiClient.get<UserSummaryResponse & { relation: FoundUser['relation'] }>('/friends/by-qr', { params: { token } });
      return { ...toUserSummary(data), relation: data.relation };
    } catch (error) {
      if (friendErrorCode(error) === 'QR_EXPIRED') return null;
      throw error;
    }
  },

  /**
   * 친구 요청. 상대가 이미 나에게 요청했으면 서버가 바로 수락 처리 (status: 'accepted').
   * QR 로 추가할 때는 사용자 ID 대신 토큰을 넘깁니다 — 요청이 만들어지면 그 토큰은 버려집니다
   */
  async sendRequest(userId: string, qrToken?: string): Promise<SendRequestResult> {
    if (!isLive('friends')) {
      [...mockContactSuggestions, ...mockNearbySuggestions]
        .filter((s) => s.user.id === userId)
        .forEach((s) => (s.requested = true));
      return mockResponse({ requestId: `mock-${userId}`, status: 'pending' });
    }
    const { data } = await apiClient.post<SendRequestResult>('/friends/requests', qrToken ? { qrToken } : { userId });
    return data;
  },

  /**
   * 친구 요청 수락/거절.
   * 서버는 첫 친구가 생겨 1인 가구 모드 해제 대상이면 알려줍니다 (WBS 4: 75세 이상은 해제하지 않음)
   */
  async respond(requestId: string, accept: boolean): Promise<{ singleHouseholdReleasable: boolean }> {
    if (!isLive('friends')) {
      const index = mockFriendRequests.findIndex((r) => r.id === requestId);
      if (index >= 0) mockFriendRequests.splice(index, 1);
      return mockResponse({ singleHouseholdReleasable: false });
    }
    const { data } = await apiClient.post(`/friends/requests/${requestId}/${accept ? 'accept' : 'reject'}`);
    return data;
  },

  async cancelRequest(requestId: string): Promise<void> {
    if (!isLive('friends')) {
      const index = mockSentRequests.findIndex((r) => r.id === requestId);
      if (index >= 0) mockSentRequests.splice(index, 1);
      return mockResponse(undefined);
    }
    await apiClient.delete(`/friends/requests/${requestId}`);
  },

  /**
   * 주소록 전화번호로 라무핀 사용자 찾기.
   * TODO(로그인 단계): 서버에 전화번호 해시 저장이 생기면 연결 (원문 대신 해시 전송). 그 전까지 서버 연결 시 빈 목록
   */
  async matchContacts(phoneNumbers: string[]): Promise<FriendSuggestion[]> {
    if (!isLive('friends')) return mockResponse(mockContactSuggestions, 800);
    void phoneNumbers;
    return [];
  },

  /**
   * 근처에 있는 라무핀 사용자 (WBS 12.9).
   *
   * **서로 동의한 사람끼리만 보입니다.** 내가 `discoverable` 을 켜지 않으면 빈 목록입니다 —
   * 내 위치는 숨기면서 남만 보는 것은 공평하지 않습니다.
   * 서버는 좌표를 주지 않습니다. 근처에 있다는 사실까지만 옵니다.
   */
  async nearby(): Promise<FriendSuggestion[]> {
    if (!isLive('friends')) return mockResponse(mockNearbySuggestions, 1200);
    const { data } = await apiClient.get<FriendSuggestion[]>('/friends/nearby');
    return data;
  },

  /** 근처 찾기에 내가 나타날지 (기본 꺼짐) */
  async getNearbyDiscoverable(): Promise<boolean> {
    if (!isLive('friends')) return mockResponse(false);
    const { data } = await apiClient.get<{ discoverable: boolean }>('/friends/nearby/discoverable');
    return data.discoverable;
  },

  async setNearbyDiscoverable(discoverable: boolean): Promise<boolean> {
    if (!isLive('friends')) return mockResponse(discoverable);
    const { data } = await apiClient.put<{ discoverable: boolean }>('/friends/nearby/discoverable', { discoverable });
    return data.discoverable;
  },

  async getShareSetting(friendId: string): Promise<FriendShareSetting> {
    if (!isLive('friends')) {
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

  /** 서버가 기획 규칙(흐림 → 경로 끔, 비공개 → 전부 끔)에 맞춰 저장한 값을 돌려줍니다 */
  async saveShareSetting(setting: FriendShareSetting): Promise<FriendShareSetting> {
    if (!isLive('friends')) {
      mockShareSettings[setting.friendId] = setting;
      return mockResponse(setting);
    }
    const { data } = await apiClient.put<FriendShareSetting>(`/friends/${setting.friendId}/share-setting`, setting);
    return data;
  },
};
