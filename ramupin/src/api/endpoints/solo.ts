import { apiClient, mockResponse } from '../client';
import { isLive } from '@/config/env';

export interface SoloAgency {
  id?: string;
  name: string;
  phone: string;
  maskedPhone?: string;
}

export interface SoloSetting {
  enabled: boolean;
  /** 움직임이 없으면 알릴 시간 */
  inactivityHours: 12 | 24 | 48;
  /** [필수] 기관 정보 제공 동의 */
  consented: boolean;
  agencies: SoloAgency[];
}

/** 1인 가구 안심 모드 (보완 4.2) */
export const soloApi = {
  async get(): Promise<SoloSetting> {
    if (!isLive('me')) return mockResponse({ enabled: false, inactivityHours: 24, consented: false, agencies: [] });
    const { data } = await apiClient.get<SoloSetting>('/me/solo');
    return data;
  },
  async save(input: { enabled: boolean; inactivityHours: 12 | 24 | 48; consent: boolean; agencies: { name: string; phone: string }[] }): Promise<SoloSetting> {
    if (!isLive('me')) return mockResponse({ enabled: input.enabled, inactivityHours: input.inactivityHours, consented: input.consent, agencies: input.agencies });
    const { data } = await apiClient.put<SoloSetting>('/me/solo', input);
    return data;
  },
};
