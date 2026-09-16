import { apiClient, mockResponse } from '../client';
import { isLive } from '@/config/env';
import { MOCK_POLICIES, type PlanPolicy } from '@/features/policy/policies';
import type { PlanId } from '@/types/models';

export const policyApi = {
  /** 내 등급 정책 (+ 관리자 사용자별 덮어쓰기 반영된 값) */
  async get(planId: PlanId): Promise<PlanPolicy> {
    if (!isLive('policy')) return mockResponse(MOCK_POLICIES[planId], 50);
    const { data } = await apiClient.get<PlanPolicy>('/me/policy');
    return data;
  },
};
