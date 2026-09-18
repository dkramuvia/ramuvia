import { readFileSync } from 'node:fs';

import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';

import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { env } from '../config/env.js';

/**
 * 푸시 알림 발송 (WBS 6단계, FCM).
 *
 * 앱이 꺼져 있어도 알림이 닿게 합니다. SOS·이상징후처럼 정작 중요한 순간에는
 * 앱이 꺼져 있기 때문에, WebSocket 만으로는 부족합니다.
 *
 * 서비스 계정 키가 없으면 발송을 건너뜁니다 (개발 중에 키 없이도 서버가 뜨도록).
 */

/** 알림 채널 (앱의 CHANNELS 와 같아야 합니다) */
export type PushChannel = 'sos' | 'danger' | 'anomaly' | 'general';

export interface PushMessage {
  title: string;
  body: string;
  channel: PushChannel;
  /** 알림을 누르면 열 화면 (예: /journey/123) */
  route?: string;
  data?: Record<string, string>;
}

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private messaging: Messaging | null = null;

  constructor(@Inject(MAIN_DB) private readonly db: MainDb) {}

  onModuleInit() {
    if (!env.FIREBASE_SERVICE_ACCOUNT_FILE) {
      this.logger.warn('FIREBASE_SERVICE_ACCOUNT_FILE 이 없어 푸시 발송을 건너뜁니다');
      return;
    }
    try {
      const raw = readFileSync(env.FIREBASE_SERVICE_ACCOUNT_FILE, 'utf8');
      const app: App = getApps()[0] ?? initializeApp({ credential: cert(JSON.parse(raw) as object) });
      this.messaging = getMessaging(app);
      this.logger.log('푸시 발송 준비 완료');
    } catch (error) {
      this.logger.error(`푸시 설정 실패: ${String(error)}`);
    }
  }

  /** 지금 푸시를 보낼 수 있는 상태인지 */
  get ready(): boolean {
    return this.messaging !== null;
  }

  async registerToken(userId: string, token: string, platform: string): Promise<void> {
    await this.db
      .insertInto('member.push_tokens')
      .values({ token, user_id: userId, platform, updated_at: new Date() })
      // 같은 기기를 다른 계정으로 쓰면 주인이 바뀝니다 (기기 물려주기)
      .onConflict((oc) =>
        oc.column('token').doUpdateSet((eb) => ({
          user_id: eb.ref('excluded.user_id'),
          platform: eb.ref('excluded.platform'),
          updated_at: eb.ref('excluded.updated_at'),
        })),
      )
      .execute();
  }

  async removeToken(userId: string, token: string): Promise<void> {
    await this.db.deleteFrom('member.push_tokens').where('token', '=', token).where('user_id', '=', userId).execute();
  }

  /**
   * 여러 사람에게 보냅니다.
   * 앱을 지운 기기의 토큰은 FCM 이 알려주므로 그때 지웁니다.
   */
  async sendToUsers(userIds: string[], message: PushMessage): Promise<{ sent: number }> {
    if (userIds.length === 0) return { sent: 0 };
    if (!this.messaging) {
      this.logger.debug(`푸시 건너뜀 (키 없음): ${message.title}`);
      return { sent: 0 };
    }

    const rows = await this.db
      .selectFrom('member.push_tokens')
      .select('token')
      .where('user_id', 'in', userIds)
      .execute();
    if (rows.length === 0) return { sent: 0 };

    const tokens = rows.map((r) => r.token);
    const response = await this.messaging.sendEachForMulticast({
      tokens,
      notification: { title: message.title, body: message.body },
      android: {
        priority: message.channel === 'sos' ? 'high' : 'normal',
        notification: { channelId: message.channel },
      },
      // 알림을 누르면 어디로 갈지. 값은 모두 문자열이어야 합니다
      data: { ...(message.data ?? {}), ...(message.route ? { route: message.route } : {}) },
    });

    await this.cleanUpDeadTokens(tokens, response.responses);
    return { sent: response.successCount };
  }

  /** 더 이상 쓸 수 없는 토큰을 지웁니다 (앱 삭제·토큰 만료) */
  private async cleanUpDeadTokens(tokens: string[], responses: { success: boolean; error?: { code: string } }[]) {
    const dead = tokens.filter((_, i) => {
      const code = responses[i]?.error?.code;
      return code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-argument';
    });
    if (dead.length === 0) return;
    await this.db.deleteFrom('member.push_tokens').where('token', 'in', dead).execute();
    this.logger.log(`쓸 수 없는 푸시 토큰 ${dead.length}개 삭제`);
  }
}
