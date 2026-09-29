import { Inject, Injectable } from '@nestjs/common';

import { MAIN_DB, type MainDb } from '../database/main-database.module.js';

/**
 * 알림 종류. 앱 [설정 > 알림] 화면의 항목과 같습니다.
 *
 * 푸시 채널(`sos` · `danger` · `anomaly` · `general`)은 **안드로이드 알림 채널**이라
 * 소리·중요도를 정하는 것이고, 이건 **사용자가 켜고 끄는 단위**입니다. 둘은 다릅니다.
 */
export type NotificationCategory =
  | 'sos'
  | 'battery'
  | 'geofence'
  | 'locationRequest'
  | 'friendRequest'
  | 'groupActivity'
  | 'notice'
  | 'marketing';

/** 설정 표의 칸 이름 */
const COLUMN = {
  sos: 'sos',
  battery: 'battery',
  geofence: 'geofence',
  locationRequest: 'location_request',
  friendRequest: 'friend_request',
  groupActivity: 'group_activity',
  notice: 'notice',
  marketing: 'marketing',
} as const satisfies Record<NotificationCategory, string>;

/** 안 켜 본 사람의 기본값. 광고성 알림만 기본이 꺼짐입니다 (정보통신망법) */
const DEFAULT_ON: Record<NotificationCategory, boolean> = {
  sos: true,
  battery: true,
  geofence: true,
  locationRequest: true,
  friendRequest: true,
  groupActivity: true,
  notice: true,
  marketing: false,
};

/** 그 시간대의 지금 시각을 `HH:MM` 으로 */
export function localHhmm(now: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  } catch {
    // 시간대 이름이 잘못 저장돼 있어도 알림이 멈추면 안 됩니다. 서울로 봅니다
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  }
}

/**
 * 지금이 방해 금지 시간 안인가.
 *
 * `23:00~05:00` 처럼 **자정을 넘기는 구간**이 흔해서, 단순히 "시작 이상이고 끝 미만" 으로
 * 보면 밤에 안 걸립니다. 넘어가는 경우는 "시작 이후 **또는** 끝 이전" 으로 봅니다.
 *
 * `HH:MM` 문자열은 자릿수가 같아서 글자 순서 비교가 곧 시각 비교입니다.
 */
export function inQuietHours(start: string, end: string, timezone: string, now = new Date()): boolean {
  const from = start.slice(0, 5);
  const to = end.slice(0, 5);
  // 시작과 끝이 같으면 구간이 없는 것으로 봅니다 (하루 종일 금지는 실수일 가능성이 큽니다)
  if (from === to) return false;
  const local = localHhmm(now, timezone);
  return from > to ? local >= from || local < to : local >= from && local < to;
}

export interface NotificationSettings {
  dndEnabled: boolean;
  /** `23:00` 꼴 */
  dndStart: string;
  dndEnd: string;
  timezone: string;
  sos: boolean;
  battery: boolean;
  geofence: boolean;
  locationRequest: boolean;
  friendRequest: boolean;
  groupActivity: boolean;
  notice: boolean;
  marketing: boolean;
}

/** `23:00:00` → `23:00` (앱은 분까지만 씁니다) */
const hhmm = (value: string) => value.slice(0, 5);

@Injectable()
export class NotificationSettingsService {
  constructor(@Inject(MAIN_DB) private readonly db: MainDb) {}

  async get(userId: string): Promise<NotificationSettings> {
    const row = await this.db
      .selectFrom('member.notification_settings')
      .selectAll()
      .where('user_id', '=', userId)
      .executeTakeFirst();
    // 가입 직후 등 아직 줄이 없으면 기본값으로 봅니다 (마이그레이션 기본값과 같습니다)
    if (!row) {
      return {
        dndEnabled: false,
        dndStart: '23:00',
        dndEnd: '05:00',
        timezone: 'Asia/Seoul',
        sos: true,
        battery: true,
        geofence: true,
        locationRequest: true,
        friendRequest: true,
        groupActivity: true,
        notice: true,
        marketing: false,
      };
    }
    return {
      dndEnabled: row.dnd_enabled,
      dndStart: hhmm(row.dnd_start),
      dndEnd: hhmm(row.dnd_end),
      timezone: row.timezone,
      sos: row.sos,
      battery: row.battery,
      geofence: row.geofence,
      locationRequest: row.location_request,
      friendRequest: row.friend_request,
      groupActivity: row.group_activity,
      notice: row.notice,
      marketing: row.marketing,
    };
  }

  async update(userId: string, input: NotificationSettings): Promise<NotificationSettings> {
    await this.db
      .insertInto('member.notification_settings')
      .values({
        user_id: userId,
        dnd_enabled: input.dndEnabled,
        dnd_start: input.dndStart,
        dnd_end: input.dndEnd,
        timezone: input.timezone,
        sos: input.sos,
        battery: input.battery,
        geofence: input.geofence,
        location_request: input.locationRequest,
        friend_request: input.friendRequest,
        group_activity: input.groupActivity,
        notice: input.notice,
        marketing: input.marketing,
        updated_at: new Date(),
      })
      .onConflict((oc) =>
        oc.column('user_id').doUpdateSet((eb) => ({
          dnd_enabled: eb.ref('excluded.dnd_enabled'),
          dnd_start: eb.ref('excluded.dnd_start'),
          dnd_end: eb.ref('excluded.dnd_end'),
          timezone: eb.ref('excluded.timezone'),
          sos: eb.ref('excluded.sos'),
          battery: eb.ref('excluded.battery'),
          geofence: eb.ref('excluded.geofence'),
          location_request: eb.ref('excluded.location_request'),
          friend_request: eb.ref('excluded.friend_request'),
          group_activity: eb.ref('excluded.group_activity'),
          notice: eb.ref('excluded.notice'),
          marketing: eb.ref('excluded.marketing'),
          updated_at: eb.ref('excluded.updated_at'),
        })),
      )
      .execute();
    return this.get(userId);
  }

  /**
   * 이 사람들 중 **지금 이 알림을 받을 사람**만 골라 냅니다.
   *
   * **SOS 는 절대 거르지 않습니다.** 방해 금지 시간이든 알림을 껐든 보냅니다.
   * 사람이 위험할 때 오는 알림이라, 못 받으면 설정의 문제가 아니라 사고가 됩니다.
   *
   * 방해 금지 판정은 DB 에서 합니다 — `23:00~05:00` 처럼 자정을 넘기는 구간과
   * 시간대 변환을 직접 계산하면 틀리기 쉽습니다.
   */
  async filterRecipients(userIds: string[], category: NotificationCategory, now = new Date()): Promise<string[]> {
    if (userIds.length === 0) return [];
    if (category === 'sos') return userIds;

    const rows = await this.db
      .selectFrom('member.users as u')
      .leftJoin('member.notification_settings as s', 's.user_id', 'u.id')
      .select([
        'u.id',
        's.dnd_enabled',
        's.dnd_start',
        's.dnd_end',
        's.timezone',
        's.battery',
        's.geofence',
        's.location_request',
        's.friend_request',
        's.group_activity',
        's.notice',
        's.marketing',
      ])
      .where('u.id', 'in', userIds)
      .execute();

    return rows
      .filter((row) => {
        // 설정 줄이 아직 없으면(가입 직후) 기본값으로 봅니다
        const on = row[COLUMN[category] as keyof typeof row] ?? DEFAULT_ON[category];
        if (!on) return false;
        if (!row.dnd_enabled) return true;
        return !inQuietHours(row.dnd_start ?? '23:00', row.dnd_end ?? '05:00', row.timezone ?? 'Asia/Seoul', now);
      })
      .map((row) => row.id);
  }
}
