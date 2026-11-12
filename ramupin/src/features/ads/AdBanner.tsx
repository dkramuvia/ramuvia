import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';

import { privacyApi } from '@/api/endpoints/privacy';
import { env } from '@/config/env';
import { usePlan } from '@/features/policy/usePlan';
import { useAuthStore } from '@/stores/authStore';

/**
 * 지도 아래 배너 광고 (AdMob, WBS 2.7).
 *
 * 띄우지 않는 경우:
 *   - 등급 정책의 광고가 '없음' (플래티넘·트리니티·케어. 관리자가 등급별로 바꿀 수 있음)
 *   - 75세 이상 (WBS 3.7, T10: 노인 사용자에게는 광고를 보이지 않습니다)
 *   - 정식 빌드인데 배너 단위 ID 가 없을 때
 *   - 광고를 못 받아 왔을 때 (빈 자리를 남기지 않습니다, 대표 리포트 83)
 *
 * 개발 빌드에서는 늘 구글 테스트 광고를 씁니다. 개발 중에 진짜 광고를 누르면 AdMob 계정이 정지될 수 있습니다.
 * 광고 SDK 는 위 조건을 확인한 뒤에야 켭니다 (app.config.ts 의 delayAppMeasurementInit).
 */

type Ads = typeof import('react-native-google-mobile-ads');

/** 광고 SDK 가 들어가기 전에 만든 개발 앱에서도 지도 화면이 죽지 않게, 없으면 광고만 뺍니다 */
const ads: Ads | null = (() => {
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

function bannerUnitId() {
  if (!ads) return null;
  if (__DEV__) return ads.TestIds.ADAPTIVE_BANNER;
  const id = Platform.OS === 'ios' ? env.ads.admobIosBannerId : env.ads.admobAndroidBannerId;
  return id || null;
}

let started: Promise<unknown> | null = null;
/** 한 번만 켭니다. 만 14세 미만이면 어린이용으로 요청합니다 (맞춤 광고 없음, 전체 이용가만) */
function startAds(child: boolean) {
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

export function AdBanner() {
  const { policy } = usePlan();
  const birthDate = useAuthStore((s) => s.user?.birthDate);
  // 개인정보 설정의 '맞춤 광고' (끄면 관심사 기반 광고를 받지 않습니다)
  const { data: privacy } = useQuery({ queryKey: ['privacy'], queryFn: privacyApi.get });
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const age = ageOf(birthDate);
  const child = age !== null && age < CHILD_AGE;
  const unitId = bannerUnitId();
  const allowed = !!ads && !!unitId && !!policy && policy.ads !== 'none' && !(age !== null && age >= SENIOR_AGE);

  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    startAds(child)
      .then(() => alive && setReady(true))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [allowed, child]);

  if (!allowed || !ready || failed || !ads || !unitId) return null;
  const { BannerAd, BannerAdSize } = ads;
  return (
    <View>
      <BannerAd
        unitId={unitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: child || !privacy?.adsPersonalized }}
        onAdFailedToLoad={() => setFailed(true)}
      />
    </View>
  );
}
