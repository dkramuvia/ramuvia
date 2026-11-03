import { Platform } from 'react-native';

import { apiClient, mockResponse } from '../client';
import { mockMe } from '../mock/data';
import { env } from '@/config/env';
import { buySubscription, syncPendingPurchases, type PaidPlan } from '@/features/billing/googlePlay';
import type { PlanId } from '@/types/models';

export type PurchaseTarget = { kind: 'plan'; planId: PlanId; yearly: boolean } | { kind: 'freeTrial'; yearly: boolean };

/** 서버가 확인한 내 구독 (GET /billing/me) */
export interface BillingSummary {
  plan: PlanId;
  planExpiresAt: string | null;
  subscription: {
    productId: string;
    basePlanId: string | null;
    yearly: boolean;
    state: string;
    trial: boolean;
    autoRenewing: boolean;
    expiresAt: string | null;
    /** 라이선스 테스트 계정의 결제 (돈이 나가지 않음) */
    testPurchase: boolean;
  } | null;
}

const verify = async (purchase: { productId: string; purchaseToken: string }) => {
  const { data } = await apiClient.post<BillingSummary>('/billing/google/verify', purchase);
  return data;
};

/**
 * 구글 플레이 정기 결제 → 서버가 구글에 직접 영수증을 확인 → 등급·만료일 변경 (billing.module.ts).
 * 목업에서는 결제창 없이 등급만 바꿉니다. 아이폰(앱스토어)은 아직 없습니다
 */
export const billingApi = {
  async purchase(target: PurchaseTarget, accountId?: string): Promise<{ planId?: PlanId }> {
    if (env.useMock) {
      mockMe.plan = target.kind === 'plan' ? target.planId : 'platinum';
      return mockResponse({ planId: mockMe.plan }, 800);
    }
    if (Platform.OS !== 'android') throw new Error('아이폰 결제는 준비 중이에요.');
    const plan = (target.kind === 'plan' ? target.planId : 'platinum') as PaidPlan;
    const summary = await buySubscription(plan, target.yearly, { trial: target.kind === 'freeTrial', accountId, verify });
    return { planId: summary.plan };
  },

  async me(): Promise<BillingSummary> {
    if (env.useMock) return mockResponse({ plan: mockMe.plan, planExpiresAt: null, subscription: null });
    const { data } = await apiClient.get<BillingSummary>('/billing/me');
    return data;
  },

  /** 앱을 열 때 서버 확인이 안 끝난 결제·갱신을 다시 보냅니다 */
  async syncPending(): Promise<BillingSummary | null> {
    if (env.useMock || Platform.OS !== 'android') return null;
    let latest: BillingSummary | null = null;
    await syncPendingPurchases(async (p) => (latest = await verify(p)));
    return latest;
  },
};
