import * as FileSystem from 'expo-file-system/legacy';

import { apiClient, mockResponse } from '../client';
import { isLive } from '@/config/env';

export interface PrivacySettings {
  /** 맞춤 광고: 광고 회사와 기기 식별자 공유 */
  adsPersonalized: boolean;
  /** 서비스 개선 분석: 오류·사용 통계 (위치 제외) */
  analytics: boolean;
  /** 마케팅 알림 (알림 설정의 마케팅과 같은 값) */
  marketing: boolean;
  /** 내 개인정보 판매·공유 거부 (캘리포니아 CCPA) */
  doNotSell: boolean;
  dataRegion: { code: string; name: string };
}

/** 개인정보 센터 (보완 4.13) */
export const privacyApi = {
  async get(): Promise<PrivacySettings> {
    if (!isLive('me')) return mockResponse({ adsPersonalized: false, analytics: true, marketing: false, doNotSell: false, dataRegion: { code: 'ap-northeast-2', name: '대한민국 (서울)' } });
    const { data } = await apiClient.get<PrivacySettings>('/me/privacy');
    return data;
  },
  async update(patch: Partial<Omit<PrivacySettings, 'dataRegion'>>): Promise<PrivacySettings> {
    if (!isLive('me')) return mockResponse({ adsPersonalized: false, analytics: true, marketing: false, doNotSell: false, dataRegion: { code: 'ap-northeast-2', name: '대한민국 (서울)' }, ...patch });
    const { data } = await apiClient.put<PrivacySettings>('/me/privacy', patch);
    return data;
  },
  /** 내 데이터를 파일로 받아 기기에 저장하고 그 경로를 돌려줍니다 */
  async exportToFile(): Promise<string> {
    const { data } = await apiClient.get<unknown>('/me/data-export');
    const path = `${FileSystem.cacheDirectory}ramupin-my-data-${new Date().toISOString().slice(0, 10)}.json`;
    await FileSystem.writeAsStringAsync(path, JSON.stringify(data, null, 2));
    return path;
  },
  async deleteHistory(range: 'today' | 'week' | 'all'): Promise<number> {
    if (!isLive('me')) return mockResponse(0);
    const { data } = await apiClient.delete<{ deleted: number }>('/me/location-history', { params: { range } });
    return data.deleted;
  },
};
