// 구글 플레이 구독 상품 등록 (Play Developer API, 서비스 계정 ramupin-billing).
// 사용: node scripts/create-play-products.mjs        → 무엇을 만들지 보여 주기만 함
//       node scripts/create-play-products.mjs --apply → 실제로 만들고 활성화
// 이미 있는 상품·요금제·혜택은 건드리지 않고 건너뜁니다. 가격을 바꾸려면 플레이 콘솔에서 바꿉니다.
// 앱에 결제 기능이 들어간 빌드가 플레이 콘솔(내부 테스트 등)에 올라가 있어야 구글이 상품 등록을 받아 줍니다.
import { GoogleAuth } from 'google-auth-library';

const apply = process.argv.includes('--apply');
const pkg = process.env.PLAY_PACKAGE_NAME ?? 'com.ramuviamanager.ramupin';
const REGIONS = 'regionsVersion.version=2022/02';
/** 연간은 월 가격 × 12 에서 10% 할인 (앱 planCatalog.ts 의 YEARLY_DISCOUNT 와 같게) */
const yearly = (monthly) => Math.round(monthly * 12 * 0.9);

const PRODUCTS = [
  {
    productId: 'ramupin_platinum',
    title: '라무핀 플래티넘',
    benefits: ['장소·지오펜스 알림 더 많이', '이동 기록 더 오래 보관', '광고 없음'],
    monthly: 5500,
    // 1개월 무료 체험 (가입 흐름 · 피그마 360:19858)
    trial: true,
  },
  {
    productId: 'ramupin_trinity',
    title: '라무핀 트리니티',
    benefits: ['가장 빠른 위치 갱신', '가장 많은 SOS·예약 메시지 인원', '광고 없음'],
    monthly: 7700,
    trial: false,
  },
];

const auth = new GoogleAuth({ keyFile: process.env.PLAY_SERVICE_ACCOUNT_FILE ?? './secrets/play-billing.json', scopes: ['https://www.googleapis.com/auth/androidpublisher'] });
const client = await auth.getClient();
const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}`;

async function call(method, path, data) {
  const res = await client.request({ url: `${base}/${path}`, method, data, validateStatus: () => true });
  if (res.status >= 400 && res.status !== 404) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(res.data).slice(0, 400)}`);
  return res.status === 404 ? null : res.data;
}

const krw = (units) => ({ currencyCode: 'KRW', units: String(units) });
const basePlan = (id, period, price) => ({
  basePlanId: id,
  autoRenewingBasePlanType: { billingPeriodDuration: period, legacyCompatible: id === 'monthly' },
  regionalConfigs: [{ regionCode: 'KR', newSubscriberAvailability: true, price: krw(price) }],
});

for (const p of PRODUCTS) {
  const plans = [basePlan('monthly', 'P1M', p.monthly), basePlan('yearly', 'P1Y', yearly(p.monthly))];
  console.log(`\n${p.productId} (${p.title}) — 월 ${p.monthly}원 / 연 ${yearly(p.monthly)}원${p.trial ? ' / 1개월 무료 체험' : ''}`);
  if (!apply) continue;

  let sub = await call('GET', `subscriptions/${p.productId}`);
  if (!sub) {
    sub = await call('POST', `subscriptions?productId=${p.productId}&${REGIONS}`, {
      packageName: pkg,
      productId: p.productId,
      listings: [{ languageCode: 'ko-KR', title: p.title, benefits: p.benefits }],
      basePlans: plans,
    });
    console.log('  상품 만듦');
  } else {
    console.log('  상품 있음 — 건너뜀');
  }

  for (const plan of sub.basePlans ?? []) {
    if (plan.state !== 'ACTIVE') {
      await call('POST', `subscriptions/${p.productId}/basePlans/${plan.basePlanId}:activate`, { packageName: pkg, productId: p.productId, basePlanId: plan.basePlanId });
      console.log(`  ${plan.basePlanId} 요금제 활성화`);
    }
    if (!p.trial) continue;
    const offerPath = `subscriptions/${p.productId}/basePlans/${plan.basePlanId}/offers`;
    let offer = await call('GET', `${offerPath}/free-trial`);
    if (!offer) {
      offer = await call('POST', `${offerPath}?offerId=free-trial&${REGIONS}`, {
        packageName: pkg,
        productId: p.productId,
        basePlanId: plan.basePlanId,
        offerId: 'free-trial',
        // 처음 1개월 무료, 그다음부터 기본 요금제 가격
        phases: [{ recurrenceCount: 1, duration: 'P1M', regionalConfigs: [{ regionCode: 'KR', free: {} }] }],
        // 이 앱의 구독을 한 번도 해 본 적 없는 계정만
        targeting: { acquisitionRule: { scope: { anySubscriptionInApp: {} } } },
        regionalConfigs: [{ regionCode: 'KR', newSubscriberAvailability: true }],
      });
      console.log(`  ${plan.basePlanId} 무료 체험 혜택 만듦`);
    }
    if (offer.state !== 'ACTIVE') {
      await call('POST', `${offerPath}/free-trial:activate`, { packageName: pkg, productId: p.productId, basePlanId: plan.basePlanId, offerId: 'free-trial' });
      console.log(`  ${plan.basePlanId} 무료 체험 활성화`);
    }
  }
}
if (!apply) console.log('\n--apply 를 붙이면 실제로 만듭니다');
