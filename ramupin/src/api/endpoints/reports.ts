import { apiClient, mockResponse } from '../client';
import { isLive } from '@/config/env';

export type ReportReason = 'spam' | 'harassment' | 'tracking' | 'inappropriate' | 'other';
export type ReportTargetKind = 'message' | 'photo' | 'profile';

export interface ReportInput {
  targetUserId: string;
  targetKind: ReportTargetKind;
  /** 메시지·사진 id */
  targetId?: string | null;
  reason: ReportReason;
  /** 신고와 함께 차단 (기본 켬) */
  block: boolean;
}

export interface BlockedUser {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  blockedAt: string;
}

/**
 * 신고 · 차단 (보완 화면 설계 4.11).
 * 차단하면 서버가 바로 친구·위치 공유·1:1 대화를 끊습니다. 상대에게는 알리지 않습니다.
 */
export const reportsApi = {
  async report(input: ReportInput): Promise<void> {
    if (!isLive('friends')) return mockResponse(undefined, 500);
    await apiClient.post('/reports', input);
  },
  async block(userId: string): Promise<void> {
    if (!isLive('friends')) return mockResponse(undefined);
    await apiClient.post(`/blocks/${userId}`);
  },
  async unblock(userId: string): Promise<void> {
    if (!isLive('friends')) return mockResponse(undefined);
    await apiClient.delete(`/blocks/${userId}`);
  },
  async blocked(): Promise<BlockedUser[]> {
    if (!isLive('friends')) return mockResponse([]);
    const { data } = await apiClient.get<BlockedUser[]>('/blocks');
    return data;
  },
};
