import { apiClient, mockResponse } from '../client';
import { mockFriends, mockMe } from '../mock/data';
import {
  mockGeofences,
  mockHideMode,
  mockHistory,
  mockJourney,
  mockSafety,
  mockScheduledMessages,
} from '../mock/settings';
import { env } from '@/config/env';
import { inbox } from '@/db/inbox';
import { isMeId } from '@/stores/authStore';
import type {
  Geofence,
  HideModeSetting,
  HistoryCategory,
  HistoryEvent,
  JourneyDay,
  SafetySetting,
  ScheduledMessage,
  User,
} from '@/types/models';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export const profileApi = {
  /** 닉네임 중복 확인 (WBS 3.9) */
  async isNicknameAvailable(nickname: string): Promise<boolean> {
    if (env.useMock) {
      const taken = mockFriends.some((f) => f.nickname === nickname);
      return mockResponse(!taken);
    }
    const { data } = await apiClient.get<{ available: boolean }>('/users/nickname-availability', { params: { nickname } });
    return data.available;
  },

  async update(patch: Pick<Partial<User>, 'nickname' | 'avatarUrl' | 'gender' | 'statusMessage'>): Promise<User> {
    if (env.useMock) {
      Object.assign(mockMe, patch);
      return mockResponse(clone(mockMe));
    }
    const { data } = await apiClient.patch<User>('/me', patch);
    return data;
  },

  /** 회원 탈퇴 (WBS 11.2: 전체 삭제, 복구 불가) */
  async withdraw(reason: string): Promise<void> {
    if (env.useMock) return mockResponse(undefined, 600);
    await apiClient.delete('/me', { data: { reason } });
  },
};

export const hideModeApi = {
  async get(): Promise<HideModeSetting> {
    if (env.useMock) return mockResponse(clone(mockHideMode));
    const { data } = await apiClient.get<HideModeSetting>('/me/hide-mode');
    return data;
  },
  async save(setting: HideModeSetting): Promise<void> {
    if (env.useMock) {
      Object.assign(mockHideMode, setting);
      return mockResponse(undefined);
    }
    await apiClient.put('/me/hide-mode', setting);
  },
};

export const safetyApi = {
  async get(): Promise<SafetySetting> {
    if (env.useMock) return mockResponse(clone(mockSafety));
    const { data } = await apiClient.get<SafetySetting>('/me/safety');
    return data;
  },
  async save(setting: SafetySetting): Promise<void> {
    if (env.useMock) {
      Object.assign(mockSafety, clone(setting));
      return mockResponse(undefined);
    }
    await apiClient.put('/me/safety', setting);
  },
};

export const geofencesApi = {
  async list(): Promise<Geofence[]> {
    if (env.useMock) return mockResponse(clone(mockGeofences));
    const { data } = await apiClient.get<Geofence[]>('/geofences');
    return data;
  },
  async save(geofence: Omit<Geofence, 'id'> & { id?: string }): Promise<Geofence> {
    if (env.useMock) {
      if (geofence.id) {
        const index = mockGeofences.findIndex((g) => g.id === geofence.id);
        mockGeofences[index] = geofence as Geofence;
        return mockResponse(clone(geofence as Geofence));
      }
      const created = { ...geofence, id: `g${Date.now()}` };
      mockGeofences.push(created);
      return mockResponse(clone(created));
    }
    const { data } = geofence.id
      ? await apiClient.put<Geofence>(`/geofences/${geofence.id}`, geofence)
      : await apiClient.post<Geofence>('/geofences', geofence);
    return data;
  },
  async remove(id: string): Promise<void> {
    if (env.useMock) {
      const index = mockGeofences.findIndex((g) => g.id === id);
      if (index >= 0) mockGeofences.splice(index, 1);
      return mockResponse(undefined);
    }
    await apiClient.delete(`/geofences/${id}`);
  },
};

export const scheduledMessagesApi = {
  async list(): Promise<ScheduledMessage[]> {
    if (env.useMock) return mockResponse(clone(mockScheduledMessages));
    const { data } = await apiClient.get<ScheduledMessage[]>('/scheduled-messages');
    return data;
  },
  async save(message: Omit<ScheduledMessage, 'id'> & { id?: string }): Promise<ScheduledMessage> {
    if (env.useMock) {
      if (message.id) {
        const index = mockScheduledMessages.findIndex((m) => m.id === message.id);
        mockScheduledMessages[index] = message as ScheduledMessage;
        return mockResponse(clone(message as ScheduledMessage));
      }
      const created = { ...message, id: `s${Date.now()}` };
      mockScheduledMessages.push(created);
      return mockResponse(clone(created));
    }
    const { data } = message.id
      ? await apiClient.put<ScheduledMessage>(`/scheduled-messages/${message.id}`, message)
      : await apiClient.post<ScheduledMessage>('/scheduled-messages', message);
    return data;
  },
  async remove(id: string): Promise<void> {
    if (env.useMock) {
      const index = mockScheduledMessages.findIndex((m) => m.id === id);
      if (index >= 0) mockScheduledMessages.splice(index, 1);
      return mockResponse(undefined);
    }
    await apiClient.delete(`/scheduled-messages/${id}`);
  },
};

export const historyApi = {
  /**
   * 알림 내역 = 기기 알림 보관함(로컬 DB, WBS 9.7) + 서버 기록.
   * 받은 알림은 기기에 남기 때문에, 서버 기록이 지워지거나 인터넷이 없어도 지난 알림을 볼 수 있습니다.
   */
  async events(category?: HistoryCategory): Promise<HistoryEvent[]> {
    const local = inbox.list(category);
    const merge = (remote: HistoryEvent[]) => {
      const byId = new Map(local.map((e) => [e.id, e]));
      for (const e of remote) byId.set(e.id, e);
      return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    };

    if (env.useMock) {
      return mockResponse(merge(mockHistory.filter((e) => !category || e.category === category)));
    }
    try {
      const { data } = await apiClient.get<HistoryEvent[]>('/me/history', { params: { category } });
      return merge(data);
    } catch (error) {
      // 인터넷이 없으면 기기에 남은 알림만이라도 보여 줍니다
      if (local.length > 0) return local;
      throw error;
    }
  },

  /** 하루 여정. 친구의 이동 경로 공유가 꺼져 있으면 서버가 null (기획: '최근 여정' 미표시) */
  async journey(userId: string): Promise<JourneyDay | null> {
    if (env.useMock) {
      if (isMeId(userId)) return mockResponse(mockJourney(userId, mockMe.batteryLevel));
      const friend = mockFriends.find((f) => f.id === userId);
      // 목업: caramel001(f5)은 이동 경로를 공개하지 않은 친구로 가정
      // (여정 공개 여부는 "친구가 나에게" 공유하는지로 서버가 판단. myShareLevel 은 내가 친구에게 공유하는 값이라 무관)
      // 서버 친구 목록(uuid)을 쓰는 동안에는 목업 친구에 없어도 샘플 여정을 보여줍니다
      if (friend?.id === 'f5') return mockResponse(null);
      return mockResponse(mockJourney(userId, friend?.batteryLevel));
    }
    const { data } = await apiClient.get<JourneyDay | null>(`/users/${userId}/journey/today`);
    return data;
  },
};
