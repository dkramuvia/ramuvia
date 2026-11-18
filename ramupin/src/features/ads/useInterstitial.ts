import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { env } from '@/config/env';

import { ads, startAds, useAdAudience } from './adsCore';

/**
 * 전면 광고 (AdMob, WBS 2.7·2.8): "전체 광고는 광고 이후 메뉴 사용", 무료 사용자만, 노인 제외.
 *
 * 탭을 옮길 때 광고를 먼저 보여 주고, 닫으면 그 메뉴로 갑니다.
 * 너무 자주 띄우면 AdMob 정책 위반이라 (wbs-check T10) 한 번 띄우면 GAP_MS 동안은 띄우지 않고,
 * 앱을 켠 직후에도 GAP_MS 가 지나야 처음 나옵니다. 광고가 준비되지 않았으면 기다리지 않고 바로 넘어갑니다.
 */
const GAP_MS = 5 * 60_000;
const RETRY_MS = 60_000;

let lastShownAt = Date.now();

function interstitialUnitId() {
  if (!ads) return null;
  if (__DEV__) return ads.TestIds.INTERSTITIAL;
  const id = Platform.OS === 'ios' ? env.ads.admobIosInterstitialId : env.ads.admobAndroidInterstitialId;
  return id || null;
}

type Interstitial = import('react-native-google-mobile-ads').InterstitialAd;

/** `runAfterAd(next)`: 띄울 때가 되었으면 광고를 보여 준 뒤 next, 아니면 바로 next */
export function useInterstitial() {
  const { fullscreen, child, nonPersonalized } = useAdAudience();
  const unitId = interstitialUnitId();
  const enabled = fullscreen && !!unitId;
  const adRef = useRef<Interstitial | null>(null);

  useEffect(() => {
    if (!enabled || !ads || !unitId) return;
    const sdk = ads;
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const offs: (() => void)[] = [];
    startAds(child)
      .then(() => {
        if (!alive) return;
        const ad = sdk.InterstitialAd.createForAdRequest(unitId, { requestNonPersonalizedAdsOnly: nonPersonalized });
        // 닫으면 다음 것을 미리 받아 둡니다. 못 받았으면 잠시 뒤 다시
        offs.push(ad.addAdEventListener(sdk.AdEventType.CLOSED, () => alive && ad.load()));
        offs.push(
          ad.addAdEventListener(sdk.AdEventType.ERROR, () => {
            clearTimeout(retry);
            retry = setTimeout(() => alive && ad.load(), RETRY_MS);
          }),
        );
        ad.load();
        adRef.current = ad;
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      clearTimeout(retry);
      offs.forEach((off) => off());
      adRef.current = null;
    };
  }, [enabled, unitId, child, nonPersonalized]);

  return useCallback((next: () => void) => {
    const ad = adRef.current;
    if (!ads || !ad?.loaded || Date.now() - lastShownAt < GAP_MS) {
      next();
      return;
    }
    lastShownAt = Date.now();
    let done = false;
    let off = () => {};
    const finish = () => {
      if (done) return;
      done = true;
      off();
      next();
    };
    off = ad.addAdEventListener(ads.AdEventType.CLOSED, finish);
    ad.show().catch(finish);
  }, []);
}
