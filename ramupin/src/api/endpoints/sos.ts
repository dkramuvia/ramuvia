import { apiClient, mockResponse } from '../client';
import { mockSafety } from '../mock/settings';
import { env } from '@/config/env';
import type { SharedPlace } from '@/types/models';

export interface SendSosInput {
  place: SharedPlace | null;
  altitude: number | null;
  /** 기기에 녹음된 파일 경로 (서버 연동 시 S3 업로드 후 키 전달) */
  audioUri: string | null;
  startedAt: string;
}

export interface SendSosResult {
  sosId: string;
  /** 알림을 받은 곳 수 (친구 + 그룹 + 관공서) */
  recipientCount: number;
}

/**
 * WBS 7.9 / 8.3 / 10.8: 지정 수신인에게 1차 전송, 지정 사용자가 없으면 회사 서버가 수신 (9.3)
 * 발송(푸시·문자·관공서)은 전부 서버에서 합니다. 앱은 위치와 녹음만 올립니다.
 */
export const sosApi = {
  async send(input: SendSosInput): Promise<SendSosResult> {
    if (env.useMock) {
      const count = mockSafety.recipientFriendIds.length + mockSafety.recipientGroupIds.length;
      return mockResponse({ sosId: `sos${Date.now()}`, recipientCount: count }, 900);
    }
    // TODO(5단계): 녹음 파일 Presigned URL 업로드 → 키 포함 전송
    const { data } = await apiClient.post<SendSosResult>('/sos', { ...input, audioUri: undefined });
    return data;
  },

  /** 녹음 전 카운트다운 중 취소 */
  async cancel(sosId: string): Promise<void> {
    if (env.useMock) return mockResponse(undefined);
    await apiClient.post(`/sos/${sosId}/cancel`);
  },
};
