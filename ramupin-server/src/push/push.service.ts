import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';

import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { env } from '../config/env.js';
import { PUSH_TEXTS } from './push-texts.js';
import { NotificationSettingsService, type NotificationCategory } from './notification-settings.service.js';

/**
 * 푸시 알림 발송 (WBS 6단계, FCM).
 *
 * 앱이 꺼져 있어도 알림이 닿게 합니다. SOS·이상징후처럼 정작 중요한 순간에는
 * 앱이 꺼져 있기 때문에, WebSocket 만으로는 부족합니다.
 *
 * 서비스 계정 키가 없으면 발송을 건너뜁니다 (개발 중에 키 없이도 서버가 뜨도록).
 */

/**
 * 알림 채널 (앱의 CHANNELS 와 같아야 합니다).
 * 알람마다 소리가 다릅니다 (요금제 안내 10-30, 4-1 알람별 알림음)
 */
export type PushChannel =
  | 'sos'
  | 'danger'
  | 'anomaly'
  | 'battery'
  | 'longStay'
  | 'safeZone'
  | 'geofence'
  | 'scheduled'
  | 'general'
  | 'chat';

/**
 * 안드로이드 채널 id 와 소리 파일 (앱 app.config 의 sounds 와 같은 이름).
 * 안드로이드는 한 번 만든 채널의 소리를 바꿀 수 없어서, 소리가 붙은 채널은 새 id 를 씁니다
 */
const ANDROID_CHANNEL: Record<PushChannel, { id: string; sound?: string }> = {
  sos: { id: 'sos_alarm', sound: 'sos_alarm.wav' },
  danger: { id: 'danger_alarm', sound: 'danger_zone_alarm.wav' },
  anomaly: { id: 'anomaly_alarm', sound: 'anomaly_alarm.wav' },
  battery: { id: 'battery_alarm', sound: 'battery_alarm.wav' },
  longStay: { id: 'long_stay_alarm', sound: 'long_stay_alarm.wav' },
  safeZone: { id: 'safe_zone_alarm', sound: 'safe_zone_alarm.wav' },
  geofence: { id: 'geofence_alarm', sound: 'geofence_alarm.wav' },
  scheduled: { id: 'scheduled_alarm', sound: 'scheduled_alarm.wav' },
  general: { id: 'general' },
  chat: { id: 'chat' },
};

/** 채널별 플랫폼 설정 (안드로이드 채널, iOS 소리) */
function platformOptions(channel: PushChannel, priority: 'high' | 'normal') {
  const { id, sound } = ANDROID_CHANNEL[channel];
  return {
    android: { priority, notification: { channelId: id, ...(sound ? { sound } : {}) } },
    apns: { payload: { aps: { sound: sound ?? 'default' } } },
  };
}

export interface PushMessage {
  title: string;
  body: string;
  channel: PushChannel;
  /**
   * 사용자가 켜고 끄는 단위 (앱 [설정 > 알림] 항목).
   *
   * 채널과 다릅니다 — 채널은 **안드로이드 알림 채널**로 소리·중요도를 정하고,
   * 이건 **받을지 말지**를 정합니다. 안 주면 채널에서 미루어 봅니다.
   */
  category?: NotificationCategory;
  /** 알림을 누르면 열 화면 (예: /journey/123) */
  route?: string;
  data?: Record<string, string>;
  /**
   * 안드로이드에는 알림 없이 데이터만 보냅니다 (FCM data-only, 높은 우선순위).
   * 앱이 꺼져 있어도 앱의 백그라운드 작업이 깨어나 소리로 읽고 알림을 직접 띄웁니다
   * (예약 메시지 소리로 읽기, 대표님 11-12. 앱 features/notifications/backgroundTask.ts).
   * 알림을 띄우는 것이 앱 몫이라 앱이 깨어나지 못하면 알림도 안 보입니다. 꼭 필요한 곳에만 씁니다.
   * 아이폰은 그대로 일반 알림입니다 (애플은 꺼진 앱이 소리로 읽는 것을 허용하지 않습니다)
   */
  androidDataOnly?: boolean;
  /**
   * 한국어가 아닌 기기에 보낼 영어 글 (11-26: 해외 사용자·앱 언어를 영어로 둔 사람).
   * 빠진 것은 한국어 그대로 갑니다 (예: 채팅 본문처럼 사람이 쓴 글). 제목이 '라무핀' 이면 알아서 'RamuPin'
   */
  en?: { title?: string; body?: string };
}

/** 기기 언어에 맞는 제목·본문 */
function localized(message: PushMessage, language: string | null | undefined): { title: string; body: string } {
  if (language === 'ko' || !language) return { title: message.title, body: message.body };
  const title = message.en?.title ?? (message.title === PUSH_TEXTS.ko.appName ? PUSH_TEXTS.en.appName : message.title);
  return { title, body: message.en?.body ?? message.body };
}

/** 종류를 안 적었을 때 채널에서 미루어 보는 값 */
const CATEGORY_OF_CHANNEL: Record<PushChannel, NotificationCategory> = {
  sos: 'sos',
  danger: 'sos',
  anomaly: 'sos',
  battery: 'battery',
  longStay: 'sos',
  safeZone: 'geofence',
  geofence: 'geofence',
  scheduled: 'scheduledMessage',
  general: 'notice',
  // 설정 > 알림 의 "그룹 활동 알림" 으로 끕니다
  chat: 'groupActivity',
};

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private messaging: Messaging | null = null;

  constructor(
    @Inject(MAIN_DB) private readonly db: MainDb,
    private readonly settings: NotificationSettingsService,
  ) {}

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

  async registerToken(userId: string, token: string, platform: string, language = 'ko'): Promise<void> {
    await this.db
      .insertInto('member.push_tokens')
      .values({ token, user_id: userId, platform, language, updated_at: new Date() })
      // 같은 기기를 다른 계정으로 쓰면 주인이 바뀝니다 (기기 물려주기)
      .onConflict((oc) =>
        oc.column('token').doUpdateSet((eb) => ({
          user_id: eb.ref('excluded.user_id'),
          platform: eb.ref('excluded.platform'),
          language: eb.ref('excluded.language'),
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

    // **여기서 한 번에 거릅니다.** 부르는 쪽마다 설정을 확인하게 하면 언젠가 빠뜨립니다
    const category = message.category ?? CATEGORY_OF_CHANNEL[message.channel];
    const allowed = await this.settings.filterRecipients(userIds, category);
    if (allowed.length === 0) {
      this.logger.debug(`알림 설정으로 모두 걸러짐 (${category}): ${message.title}`);
      return { sent: 0 };
    }
    userIds = allowed;

    const messaging = this.messaging;
    if (!messaging) {
      this.logger.debug(`푸시 건너뜀 (키 없음): ${message.title}`);
      return { sent: 0 };
    }

    const rows = await this.db
      .selectFrom('member.push_tokens')
      .select(['token', 'platform', 'language'])
      .where('user_id', 'in', userIds)
      .execute();
    if (rows.length === 0) return { sent: 0 };

    // 언어별로 나눠 보냅니다 (한국어 기기 / 그 밖의 기기는 영어)
    let sent = 0;
    for (const english of [false, true]) {
      const group = rows.filter((r) => (r.language !== 'ko') === english);
      if (group.length > 0) sent += await this.sendGroup(messaging, group, message, localized(message, english ? 'en' : 'ko'));
    }
    return { sent };
  }

  /** 같은 글을 받는 기기들에게 보냅니다 */
  private async sendGroup(messaging: Messaging, rows: { token: string; platform: string }[], message: PushMessage, text: { title: string; body: string }): Promise<number> {
    // 알림을 누르면 어디로 갈지. 값은 모두 문자열이어야 합니다
    const data = { ...(message.data ?? {}), ...(message.route ? { route: message.route } : {}) };
    const dataOnly = message.androidDataOnly ? rows.filter((r) => r.platform === 'android').map((r) => r.token) : [];
    const tokens = rows.map((r) => r.token).filter((t) => !dataOnly.includes(t));
    let sent = 0;

    if (tokens.length > 0) {
      const response = await messaging.sendEachForMulticast({
        tokens,
        notification: text,
        ...platformOptions(message.channel, message.channel === 'general' || message.channel === 'chat' ? 'normal' : 'high'),
        data,
      });
      await this.cleanUpDeadTokens(tokens, response.responses);
      sent += response.successCount;
    }

    if (dataOnly.length > 0) {
      const response = await messaging.sendEachForMulticast({
        tokens: dataOnly,
        // 알림 없이 데이터만: 제목·내용·채널을 data 에 싣고 앱이 알림을 만듭니다. pushId 로 같은 것을 두 번 띄우지 않습니다
        data: {
          ...data,
          dataOnly: '1',
          title: text.title,
          body: text.body,
          channelId: ANDROID_CHANNEL[message.channel].id,
          pushId: randomUUID(),
        },
        // 높은 우선순위여야 절전(Doze) 중에도 앱을 깨울 수 있습니다
        android: { priority: 'high' },
      });
      await this.cleanUpDeadTokens(dataOnly, response.responses);
      sent += response.successCount;
    }

    return sent;
  }

  /**
   * 특정 기기 토큰으로 보냅니다 (알림 설정과 상관없는 보안 알림).
   * 예: 다른 기기에서 로그인되어 이 기기의 위치 공유가 멈췄을 때 (보완 4.21)
   */
  async sendToTokens(tokens: { token: string; language: string }[], message: PushMessage): Promise<{ sent: number }> {
    if (tokens.length === 0 || !this.messaging) return { sent: 0 };
    let sent = 0;
    for (const english of [false, true]) {
      const group = tokens.filter((t) => (t.language !== 'ko') === english).map((t) => t.token);
      if (group.length === 0) continue;
      const response = await this.messaging.sendEachForMulticast({
        tokens: group,
        notification: localized(message, english ? 'en' : 'ko'),
        ...platformOptions(message.channel, 'high'),
        data: { ...(message.data ?? {}), ...(message.route ? { route: message.route } : {}) },
      });
      sent += response.successCount;
    }
    return { sent };
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
