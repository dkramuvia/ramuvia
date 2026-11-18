import { useQuery } from '@tanstack/react-query';

import { privacyApi } from '@/api/endpoints/privacy';
import { usePlan } from '@/features/policy/usePlan';
import { useAuthStore } from '@/stores/authStore';

/**
 * 배너·전면 광고가 같이 쓰는 부분 (AdMob).
 *
 * 광고를 보이지 않는 사람:
 *   - 등급 정책의 광고가 '없음' (플래티넘·트리니티·케어. 관리자가 등급별로 바꿀 수 있음)
 *   - 75세 이상 (WBS 3.7, T10: 노인 사용자에게는 광고를 보이지 않습니다)
 * 광고 SDK 는 이 조건을 확인한 뒤에야 켭니다 (app.config.ts 의 delayAppMeasurementInit).
 */

export type Ads = typeof import('react-native-google-mobile-ads');

/** 광고 SDK 가 들어가기 전에 만든 개발 앱에서도 화면이 죽지 않게, 없으면 광고만 뺍니다 */
export const ads: Ads | null = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-google-mobile-ads') as Ads;
  } catch {
    return null;
  }
})();

const SENIOR_AGE = 75;
const CHILD_AGE = 14;

/** 만 나이 (생일이 없으면 null) */
function ageOf(birthDate?: string) {
  if (!birthDate) return null;
  const [y, m, d] = birthDate.split('-').map(Number);
  if (!y) return null;
  const now = new Date();
  const beforeBirthday = now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d);
  return now.getFullYear() - y - (beforeBirthday ? 1 : 0);
}

let started: Promise<unknown> | null = null;
/** 한 번만 켭니다. 만 14세 미만이면 어린이용으로 요청합니다 (맞춤 광고 없음, 전체 이용가만) */
export function startAds(child: boolean) {
  if (!ads) return Promise.resolve();
  started ??= ads
    .default()
    .setRequestConfiguration({
      maxAdContentRating: child ? ads.MaxAdContentRating.G : ads.MaxAdContentRating.T,
      tagForChildDirectedTreatment: child,
      tagForUnderAgeOfConsent: child,
    })
    .then(() => ads.default().initialize());
  return started;
}

/** 지금 사용자에게 광고를 보여도 되는지와 요청 방법 */
export function useAdAudience() {
  const { policy } = usePlan();
  const birthDate = useAuthStore((s) => s.user?.birthDate);
  // 개인정보 설정의 '맞춤 광고' (끄면 관심사 기반 광고를 받지 않습니다)
  const { data: privacy } = useQuery({ queryKey: ['privacy'], queryFn: privacyApi.get });

  const age = ageOf(birthDate);
  const child = age !== null && age < CHILD_AGE;
  const senior = age !== null && age >= SENIOR_AGE;
  const level = policy?.ads ?? 'none';
  return {
    /** 배너를 띄워도 됨 */
    banner: !!ads && !senior && level !== 'none',
    /** 전면 광고를 띄워도 됨 (무료 등급만, WBS 2.8) */
    fullscreen: !!ads && !senior && level === 'banner+fullscreen',
    child,
    nonPersonalized: child || !privacy?.adsPersonalized,
  };
}
