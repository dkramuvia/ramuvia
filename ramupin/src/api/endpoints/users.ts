import { apiClient, mockResponse } from '../client';
import { mockMe } from '../mock/data';
import { isLive } from '@/config/env';
import type { PlanId, User } from '@/types/models';

/** 서버 GET /me 응답 */
interface MeResponse {
  id: string;
  publicId: string;
  nickname: string;
  gender: User['gender'] | null;
  birthDate: string | null;
  avatarUrl: string | null;
  statusMessage: string | null;
  plan: PlanId;
  singleHouseholdMode: boolean;
}

export const usersApi = {
  async me(): Promise<User> {
    if (!isLive('me')) return mockResponse(mockMe);
    const { data } = await apiClient.get<MeResponse>('/me');
    return {
      id: data.id,
      publicId: data.publicId,
      nickname: data.nickname,
      gender: data.gender ?? undefined,
      birthDate: data.birthDate ?? undefined,
      avatarUrl: data.avatarUrl ?? undefined,
      statusMessage: data.statusMessage ?? undefined,
      plan: data.plan,
      singleHouseholdMode: data.singleHouseholdMode,
      // TODO: 내 배터리는 기기에서 직접 읽기 (expo-battery)
      batteryLevel: mockMe.batteryLevel,
    };
  },

  /** 1인 가구 모드 켜기/끄기 */
  async setSingleHousehold(enabled: boolean): Promise<void> {
    if (!isLive('me')) {
      mockMe.singleHouseholdMode = enabled;
      return mockResponse(undefined);
    }
    await apiClient.put('/me/single-household', { enabled });
  },
};
