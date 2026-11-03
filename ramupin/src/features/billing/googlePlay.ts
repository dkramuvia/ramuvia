import {
  deepLinkToSubscriptions,
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  isUserCancelledError,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  type Purchase,
  type SubscriptionOffer,
} from 'expo-iap';

/**
 * 구글 플레이 정기 결제.
 * 상품은 등급마다 하나(ramupin_platinum · ramupin_trinity), 그 안에 기본 요금제 monthly · yearly,
 * 플래티넘에는 1개월 무료 체험 혜택(free-trial)이 붙어 있습니다.
 * 결제가 끝나면 영수증을 서버로 보내 확인받은 뒤에야 마무리합니다 (verify → finishTransaction)
 */
export const PLAY_PRODUCTS = { platinum: 'ramupin_platinum', trinity: 'ramupin_trinity' } as const;
export type PaidPlan = keyof typeof PLAY_PRODUCTS;
const PRODUCT_IDS: string[] = Object.values(PLAY_PRODUCTS);

export class PurchaseCancelled extends Error {
  constructor() {
    super('cancelled');
  }
}

let connecting: Promise<unknown> | null = null;
function connect() {
  connecting ??= initConnection().catch((error: unknown) => {
    connecting = null;
    throw error;
  });
  return connecting;
}

/** 고른 요금제(월간·연간)의 결제 혜택. 무료 체험을 원하면 체험 혜택을, 아니면 기본 요금제를 고릅니다 */
async function pickOffer(productId: string, basePlanId: string, trial: boolean): Promise<SubscriptionOffer> {
  const products = await fetchProducts({ skus: [productId], type: 'subs' });
  const product = products?.find((p) => p.id === productId);
  const offers = ((product && 'subscriptionOffers' in product ? product.subscriptionOffers : null) ?? []).filter(
    (o) => o.basePlanIdAndroid === basePlanId && o.offerTokenAndroid,
  );
  const isTrial = (o: SubscriptionOffer) => o.paymentMode === 'free-trial' || Boolean(o.pricingPhasesAndroid?.pricingPhaseList?.some((p) => p.priceAmountMicros === '0'));
  // 체험을 이미 쓴 계정에는 구글이 체험 혜택을 주지 않습니다 → 기본 요금제로
  const offer = (trial ? offers.find(isTrial) : undefined) ?? offers.find((o) => !isTrial(o)) ?? offers[0];
  if (!offer) throw new Error('스토어에서 상품을 찾지 못했어요. 잠시 후 다시 시도해 주세요.');
  return offer;
}

/**
 * 구글 결제창을 띄우고, 결제되면 verify(서버 확인)까지 마친 뒤 돌려줍니다.
 * 사용자가 결제창을 닫으면 PurchaseCancelled
 */
export async function buySubscription<T>(
  plan: PaidPlan,
  yearly: boolean,
  options: { trial?: boolean; accountId?: string; verify: (purchase: { productId: string; purchaseToken: string }) => Promise<T> },
): Promise<T> {
  await connect();
  const productId = PLAY_PRODUCTS[plan];
  const offer = await pickOffer(productId, yearly ? 'yearly' : 'monthly', options.trial ?? false);

  return new Promise<T>((resolve, reject) => {
    let done = false;
    const cleanup = () => {
      done = true;
      updated.remove();
      failed.remove();
    };
    const updated = purchaseUpdatedListener((purchase: Purchase) => {
      if (done || purchase.productId !== productId || !purchase.purchaseToken) return;
      cleanup();
      settle(purchase, options.verify).then(resolve, reject);
    });
    const failed = purchaseErrorListener((error) => {
      if (done) return;
      cleanup();
      reject(isUserCancelledError(error) ? new PurchaseCancelled() : new Error(error.message));
    });
    requestPurchase({
      type: 'subs',
      request: {
        google: {
          skus: [productId],
          subscriptionOffers: [{ sku: productId, offerToken: offer.offerTokenAndroid! }],
          // 구글 쪽 결제에 우리 회원을 붙여 둡니다 (문의 대응)
          obfuscatedAccountId: options.accountId,
        },
      },
    }).catch((error: unknown) => {
      if (done) return;
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    });
  });
}

/** 서버 확인이 끝난 결제만 마무리합니다. 확인이 실패하면 남겨 두었다가 다음에 다시 보냅니다 */
async function settle<T>(purchase: Purchase, verify: (p: { productId: string; purchaseToken: string }) => Promise<T>): Promise<T> {
  const result = await verify({ productId: purchase.productId, purchaseToken: purchase.purchaseToken! });
  // 서버가 이미 구글에 승인했지만, 기기 쪽 결제 대기열도 비웁니다
  await finishTransaction({ purchase, isConsumable: false }).catch(() => undefined);
  return result;
}

/**
 * 앱을 열 때: 결제는 됐는데 서버 확인 전에 앱이 꺼진 결제, 다른 기기에서 한 구독 갱신을 서버에 다시 보냅니다
 */
export async function syncPendingPurchases(verify: (p: { productId: string; purchaseToken: string }) => Promise<unknown>) {
  await connect();
  const purchases = await getAvailablePurchases();
  for (const purchase of purchases) {
    if (!PRODUCT_IDS.includes(purchase.productId) || !purchase.purchaseToken) continue;
    await settle(purchase, verify).catch(() => undefined);
  }
}

/** 구글 플레이 구독 관리 화면 (해지·결제 수단 변경) */
export async function openSubscriptionSettings(plan?: PaidPlan) {
  await deepLinkToSubscriptions(plan ? { skuAndroid: PLAY_PRODUCTS[plan] } : undefined);
}
