import { mockResponse } from '../client';
import { mockGroups, mockMe } from '../mock/data';
import { env } from '@/config/env';
import type { PlanId } from '@/types/models';

export type PurchaseTarget = { kind: 'plan'; planId: PlanId; yearly: boolean } | { kind: 'groupPremium'; groupId: string; yearly: boolean } | { kind: 'freeTrial'; yearly: boolean };

/**
 * TODO(7단계): Google Play Billing / App Store 인앱결제 (RevenueCat 또는 react-native-iap)
 *  1) 스토어 결제창 → 2) 영수증을 서버로 보내 검증 → 3) 서버가 등급 변경·만료일 저장
 * 지금은 목업에서만 등급이 바뀝니다. (기획서의 "애플페이/구글페이 결제창"은 스토어 정책상 사용 불가)
 */
export const billingApi = {
  async purchase(target: PurchaseTarget): Promise<{ planId?: PlanId }> {
    if (!env.useMock) throw new Error('스토어 결제는 7단계에서 연동됩니다.');
    if (target.kind === 'plan') {
      mockMe.plan = target.planId;
      return mockResponse({ planId: target.planId }, 800);
    }
    if (target.kind === 'freeTrial') {
      mockMe.plan = 'platinum';
      return mockResponse({ planId: 'platinum' }, 800);
    }
    const group = mockGroups.find((g) => g.id === target.groupId);
    if (group) group.isPremium = true;
    return mockResponse({}, 800);
  },
};
