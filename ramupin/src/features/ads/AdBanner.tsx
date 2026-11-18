import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';

import { env } from '@/config/env';

import { ads, startAds, useAdAudience } from './adsCore';

/**
 * 지도 아래 배너 광고 (AdMob, WBS 2.7). 누구에게 보이는지는 adsCore.ts.
 *
 * 그 밖에 띄우지 않는 경우:
 *   - 정식 빌드인데 배너 단위 ID 가 없을 때
 *   - 광고를 못 받아 왔을 때 (빈 자리를 남기지 않습니다, 대표 리포트 83)
 *
 * 개발 빌드에서는 늘 구글 테스트 광고를 씁니다. 개발 중에 진짜 광고를 누르면 AdMob 계정이 정지될 수 있습니다.
 */

function bannerUnitId() {
  if (!ads) return null;
  if (__DEV__) return ads.TestIds.ADAPTIVE_BANNER;
  const id = Platform.OS === 'ios' ? env.ads.admobIosBannerId : env.ads.admobAndroidBannerId;
  return id || null;
}

export function AdBanner() {
  const audience = useAdAudience();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const unitId = bannerUnitId();
  const allowed = audience.banner && !!unitId;
  const { child } = audience;

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
        requestOptions={{ requestNonPersonalizedAdsOnly: audience.nonPersonalized }}
        onAdFailedToLoad={() => setFailed(true)}
      />
    </View>
  );
}
