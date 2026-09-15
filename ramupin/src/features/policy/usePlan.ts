import { useQuery } from '@tanstack/react-query';

import { FEATURE_MIN_PLAN, type PlanPolicy } from './policies';
import { policyApi } from '@/api/endpoints/policy';
import { useAuthStore } from '@/stores/authStore';

type Feature = keyof PlanPolicy['features'];
type LimitKey = { [K in keyof PlanPolicy]: PlanPolicy[K] extends number ? K : never }[keyof PlanPolicy];

/**
 * 등급별 권한 체크를 한 곳에서: `can('premiumMap')`, `limit('sosRecipientLimit')`
 * 정책은 서버에서 받아 캐시합니다 (관리자가 바꾸면 앱 재시작·푸시로 갱신, WBS 11.5·11.6)
 */
export function usePlan() {
  const planId = useAuthStore((s) => s.user?.plan ?? 'basic');
  const { data: policy } = useQuery({
    queryKey: ['policy', planId],
    queryFn: () => policyApi.get(planId),
    staleTime: 10 * 60_000,
  });

  return {
    planId,
    policy,
    can: (feature: Feature) => policy?.features[feature] ?? false,
    limit: (key: LimitKey) => (policy?.[key] as number | undefined) ?? 0,
    minPlanFor: (feature: Feature) => FEATURE_MIN_PLAN[feature],
  };
}
