import { Body, Controller, Get, HttpStatus, Inject, Injectable, Logger, Module, Post, UseGuards, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { GoogleAuth } from 'google-auth-library';
import type { Redis } from 'ioredis';
import { z } from 'zod';

import { AuthGuard, CurrentUser, type AuthUser } from '../auth/auth.guard.js';
import { appError, parseInput } from '../common/app-error.js';
import { env } from '../config/env.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { REDIS } from '../redis/redis.module.js';

/**
 * 구글 플레이 정기 결제 (플래티넘·트리니티).
 *
 * 1) 앱이 구글 결제창으로 결제하고 받은 영수증(purchase token)을 보냅니다.
 * 2) 서버가 구글(Play Developer API)에 직접 물어 진짜 결제인지, 언제까지인지 확인합니다.
 * 3) 맞으면 등급·만료일을 바꾸고 구글에 "받았음"(acknowledge)을 알립니다 — 3일 안에 안 알리면 구글이 환불합니다.
 * 4) 갱신·해지·환불은 만료가 다가온 구독을 다시 물어 반영합니다.
 *
 * 라이선스 테스트 계정의 결제는 테스트 카드로 처리돼 돈이 나가지 않고, 구글 응답에 testPurchase 가 붙습니다.
 */

/** 스토어 상품 → 등급. 상품마다 기본 요금제 monthly / yearly 가 있습니다 */
export const PRODUCTS: Record<string, 'platinum' | 'trinity'> = {
  ramupin_platinum: 'platinum',
  ramupin_trinity: 'trinity',
};
/** 두 구독이 겹치면 높은 등급 */
const RANK: Record<string, number> = { platinum: 1, trinity: 2 };

/** 이 상태면 혜택을 줍니다. 해지(CANCELED)해도 만료일까지는 씁니다 */
const ENTITLED = new Set(['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED']);
/** 더 볼 일이 없는 상태 */
const FINAL = ['SUBSCRIPTION_STATE_EXPIRED', 'REPLACED'];

const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
/** 만료가 이만큼 남은 구독을 다시 확인합니다. 테스트 결제는 월간이 5분마다 갱신돼 짧게 잡습니다 */
const RECHECK_WITHIN_MS = 10 * 60_000;
const RECHECK_INTERVAL_MS = 5 * 60_000;
const LOCK_KEY = 'billing:recheck-lock';

interface PlaySubscription {
  subscriptionState?: string;
  acknowledgementState?: string;
  linkedPurchaseToken?: string;
  latestOrderId?: string;
  testPurchase?: object;
  lineItems?: {
    productId?: string;
    expiryTime?: string;
    autoRenewingPlan?: { autoRenewEnabled?: boolean };
    offerDetails?: { basePlanId?: string; offerId?: string };
    offerPhase?: { freeTrial?: object };
  }[];
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private auth: GoogleAuth | null = null;

  constructor(
    @Inject(MAIN_DB) private readonly db: MainDb,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  get ready(): boolean {
    return Boolean(env.PLAY_SERVICE_ACCOUNT_FILE);
  }

  private async play<T>(method: 'GET' | 'POST', path: string): Promise<T> {
    this.auth ??= new GoogleAuth({ keyFile: env.PLAY_SERVICE_ACCOUNT_FILE, scopes: ['https://www.googleapis.com/auth/androidpublisher'] });
    const client = await this.auth.getClient();
    const res = await client.request<T>({ url: `${API}/${env.PLAY_PACKAGE_NAME}/${path}`, method, validateStatus: () => true });
    if (res.status >= 400) throw new PlayError(res.status, JSON.stringify(res.data).slice(0, 300));
    return res.data;
  }

  /** 앱이 결제 직후(또는 앱을 열 때 남아 있던 결제를) 보냅니다 */
  async verifyGoogle(userId: string, input: { productId: string; purchaseToken: string }) {
    if (!this.ready) throw appError(HttpStatus.SERVICE_UNAVAILABLE, 'BILLING_UNAVAILABLE', '결제 설정이 없습니다');
    if (!PRODUCTS[input.productId]) throw appError(HttpStatus.BAD_REQUEST, 'UNKNOWN_PRODUCT', '모르는 상품입니다');

    const owner = await this.db.selectFrom('billing.subscriptions').select('user_id').where('purchase_token', '=', input.purchaseToken).executeTakeFirst();
    // 같은 구글 결제를 다른 라무핀 계정에 또 쓰지 못하게
    if (owner && owner.user_id !== userId) throw appError(HttpStatus.CONFLICT, 'PURCHASE_OWNED', '다른 계정의 결제입니다');

    let sub: PlaySubscription;
    try {
      sub = await this.play<PlaySubscription>('GET', `purchases/subscriptionsv2/tokens/${encodeURIComponent(input.purchaseToken)}`);
    } catch (error) {
      if (error instanceof PlayError && (error.status === 400 || error.status === 404 || error.status === 410)) {
        throw appError(HttpStatus.BAD_REQUEST, 'PURCHASE_INVALID', '구글에서 확인되지 않는 결제입니다');
      }
      throw error;
    }
    const item = sub.lineItems?.find((l) => l.productId === input.productId);
    if (!item) throw appError(HttpStatus.BAD_REQUEST, 'PURCHASE_INVALID', '결제한 상품이 다릅니다');

    await this.save(userId, input.purchaseToken, input.productId, sub);
    // 이 영수증이 이전 구독을 대신하면 (업그레이드·재구독) 이전 것은 끝난 것으로
    if (sub.linkedPurchaseToken) {
      await this.db
        .updateTable('billing.subscriptions')
        .set({ state: 'REPLACED', updated_at: new Date() })
        .where('purchase_token', '=', sub.linkedPurchaseToken)
        .where('user_id', '=', userId)
        .execute();
    }
    if (sub.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING' && sub.subscriptionState && ENTITLED.has(sub.subscriptionState)) {
      await this.play('POST', `purchases/subscriptions/${input.productId}/tokens/${encodeURIComponent(input.purchaseToken)}:acknowledge`);
    }
    await this.applyPlan(userId);
    return this.summary(userId);
  }

  private async save(userId: string, token: string, productId: string, sub: PlaySubscription) {
    const item = sub.lineItems?.find((l) => l.productId === productId) ?? sub.lineItems?.[0];
    const now = new Date();
    const row = {
      user_id: userId,
      product_id: productId,
      base_plan_id: item?.offerDetails?.basePlanId ?? null,
      plan: PRODUCTS[productId],
      state: sub.subscriptionState ?? 'SUBSCRIPTION_STATE_UNSPECIFIED',
      trial: Boolean(item?.offerPhase?.freeTrial) || /trial/i.test(item?.offerDetails?.offerId ?? ''),
      auto_renewing: item?.autoRenewingPlan?.autoRenewEnabled ?? false,
      expires_at: item?.expiryTime ? new Date(item.expiryTime) : null,
      order_id: sub.latestOrderId ?? null,
      test_purchase: Boolean(sub.testPurchase),
      linked_token: sub.linkedPurchaseToken ?? null,
      raw: JSON.stringify(sub),
      updated_at: now,
      checked_at: now,
    };
    await this.db
      .insertInto('billing.subscriptions')
      .values({ purchase_token: token, ...row })
      .onConflict((oc) => oc.column('purchase_token').doUpdateSet(row))
      .execute();
  }

  /**
   * 살아 있는 구독 중 가장 높은 등급으로 맞춥니다.
   * 구독이 모두 끝났으면 무료(basic)로 — 단, 관리자가 따로 준 등급(만료일이 구독과 다름)은 건드리지 않습니다
   */
  async applyPlan(userId: string, now = new Date()) {
    const subs = await this.db
      .selectFrom('billing.subscriptions')
      .select(['plan', 'state', 'expires_at'])
      .where('user_id', '=', userId)
      .orderBy('expires_at', 'desc')
      .execute();
    const live = subs.filter((s) => ENTITLED.has(s.state) && s.expires_at && s.expires_at > now);
    const best = live.sort((a, b) => (RANK[b.plan] ?? 0) - (RANK[a.plan] ?? 0))[0];
    if (best) {
      await this.db.updateTable('member.users').set({ plan: best.plan, plan_expires_at: best.expires_at, updated_at: now }).where('id', '=', userId).execute();
      return;
    }
    const user = await this.db.selectFrom('member.users').select(['plan', 'plan_expires_at']).where('id', '=', userId).executeTakeFirst();
    const lastExpiry = subs[0]?.expires_at?.getTime();
    const fromBilling = user?.plan_expires_at && lastExpiry && Math.abs(user.plan_expires_at.getTime() - lastExpiry) < 1000;
    const expired = user?.plan_expires_at && user.plan_expires_at <= now;
    if (user && user.plan !== 'basic' && (fromBilling || expired)) {
      await this.db.updateTable('member.users').set({ plan: 'basic', plan_expires_at: null, updated_at: now }).where('id', '=', userId).execute();
      this.logger.log(`구독 종료로 무료 등급 전환 (${user.plan})`);
    }
  }

  /** 내 요금제 화면: 지금 쓰는 구독 */
  async summary(userId: string) {
    const user = await this.db.selectFrom('member.users').select(['plan', 'plan_expires_at']).where('id', '=', userId).executeTakeFirstOrThrow();
    const sub = await this.db
      .selectFrom('billing.subscriptions')
      .select(['product_id', 'base_plan_id', 'state', 'trial', 'auto_renewing', 'expires_at', 'test_purchase'])
      .where('user_id', '=', userId)
      .where('state', 'not in', FINAL)
      .orderBy('expires_at', 'desc')
      .executeTakeFirst();
    return {
      plan: user.plan,
      planExpiresAt: user.plan_expires_at?.toISOString() ?? null,
      subscription: sub
        ? {
            productId: sub.product_id,
            basePlanId: sub.base_plan_id,
            yearly: sub.base_plan_id === 'yearly',
            state: sub.state,
            trial: sub.trial,
            autoRenewing: sub.auto_renewing,
            expiresAt: sub.expires_at?.toISOString() ?? null,
            testPurchase: sub.test_purchase,
          }
        : null,
    };
  }

  /** 만료가 다가온(또는 지난) 구독을 구글에 다시 물어 갱신·해지·환불을 반영합니다 */
  async recheckDue(now = new Date()) {
    if (!this.ready) return;
    const locked = await this.redis.set(LOCK_KEY, '1', 'EX', 10 * 60, 'NX');
    if (!locked) return;
    try {
      const due = await this.db
        .selectFrom('billing.subscriptions')
        .select(['purchase_token', 'user_id', 'product_id'])
        .where('state', 'not in', FINAL)
        .where('expires_at', '<', new Date(now.getTime() + RECHECK_WITHIN_MS))
        .where('checked_at', '<', new Date(now.getTime() - RECHECK_INTERVAL_MS + 30_000))
        .limit(200)
        .execute();
      for (const row of due) {
        try {
          const sub = await this.play<PlaySubscription>('GET', `purchases/subscriptionsv2/tokens/${encodeURIComponent(row.purchase_token)}`);
          await this.save(row.user_id, row.purchase_token, row.product_id, sub);
        } catch (error) {
          // 구글이 모르는 영수증(오래된 테스트 결제 등)은 끝난 것으로
          if (error instanceof PlayError && (error.status === 404 || error.status === 410)) {
            await this.db
              .updateTable('billing.subscriptions')
              .set({ state: 'SUBSCRIPTION_STATE_EXPIRED', updated_at: now, checked_at: now })
              .where('purchase_token', '=', row.purchase_token)
              .execute();
          } else {
            this.logger.warn(`구독 재확인 실패: ${String(error)}`);
            continue;
          }
        }
        await this.applyPlan(row.user_id, now);
      }
    } finally {
      await this.redis.del(LOCK_KEY);
    }
  }
}

class PlayError extends Error {
  constructor(
    readonly status: number,
    body: string,
  ) {
    super(`Play API ${status}: ${body}`);
  }
}

const verifyBody = z.object({ productId: z.string().min(1).max(100), purchaseToken: z.string().min(10).max(2000) });

@Controller('billing')
@UseGuards(AuthGuard)
class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Post('google/verify')
  verify(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.billing.verifyGoogle(user.id, parseInput(verifyBody, body));
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.billing.summary(user.id);
  }
}

@Module({ controllers: [BillingController], providers: [BillingService], exports: [BillingService] })
export class BillingModule implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(BillingModule.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(@Inject(BillingService) private readonly billing: BillingService) {}

  onModuleInit() {
    if (!this.billing.ready) this.logger.warn('PLAY_SERVICE_ACCOUNT_FILE 이 없어 결제 확인을 건너뜁니다');
    this.timer = setInterval(() => void this.run(), RECHECK_INTERVAL_MS);
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  private async run() {
    try {
      await this.billing.recheckDue();
    } catch (error) {
      this.logger.error(`구독 재확인 실패: ${String(error)}`);
    }
  }
}
