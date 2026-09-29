import { Inject, Injectable, Logger } from '@nestjs/common';

import { hashPhone, normalizePhone } from '../common/phone.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';

/**
 * 주소록으로 친구 찾기 (WBS 12.9).
 *
 * **번호를 저장하지 않습니다.** 받은 번호는 이 함수 안에서 해시로 바꿔 조회에만 쓰고
 * 버립니다. 로그에도 남기지 않습니다 — 남의 주소록이 서버 로그에 쌓이면 그 자체가 사고입니다.
 *
 * **왜 앱이 해시를 만들지 않나**: 서버의 해시는 비밀키를 쓰는 HMAC 입니다(`common/phone.ts`).
 * 앱이 같은 값을 만들려면 그 키를 앱에 넣어야 하는데, 앱에 넣은 키는 공개된 키입니다.
 * 키 없이 그냥 SHA-256 을 쓰면 국내 휴대폰 번호는 1억 개뿐이라 전부 뒤집어 볼 수 있어
 * 보호가 되지 않습니다. 그래서 번호는 TLS 로 받고, **서버가 해시로 바꾼 뒤 즉시 버립니다.**
 */

/** 한 번에 받는 최대 개수. 주소록 전체를 통째로 퍼 가는 것을 막습니다 */
export const MAX_NUMBERS = 500;

export interface ContactSuggestion {
  user: { id: string; publicId: string; nickname: string; avatarUrl: string | null };
  requested: boolean;
  foundAt: string;
}

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);

  constructor(@Inject(MAIN_DB) private readonly db: MainDb) {}

  async getDiscoverable(userId: string): Promise<{ discoverable: boolean }> {
    const row = await this.db.selectFrom('member.users').select('phone_discoverable').where('id', '=', userId).executeTakeFirst();
    return { discoverable: row?.phone_discoverable ?? true };
  }

  async setDiscoverable(userId: string, discoverable: boolean): Promise<{ discoverable: boolean }> {
    await this.db
      .updateTable('member.users')
      .set({ phone_discoverable: discoverable, updated_at: new Date() })
      .where('id', '=', userId)
      .execute();
    return { discoverable };
  }

  /**
   * 주소록 번호 중 라무핀을 쓰는 사람.
   *
   * 이미 친구인 사람과 나 자신은 뺍니다. 찾기를 꺼 둔 사람도 뺍니다.
   */
  async match(userId: string, phoneNumbers: string[], now = new Date()): Promise<ContactSuggestion[]> {
    // 같은 번호가 여러 번 들어오는 일이 흔합니다 (집·회사 등)
    const hashes = [...new Set(phoneNumbers.map(normalizePhone).filter((n) => n.length >= 9).map(hashPhone))];
    if (hashes.length === 0) return [];

    // 개인정보를 다룬 기록. **찾은 것이 있든 없든 남깁니다** — 조회 자체가 처리 행위입니다.
    // **번호는 적지 않습니다.** 남의 주소록이 서버 기록에 쌓이면 그 자체가 사고입니다
    await this.db
      .insertInto('member.phone_access_logs')
      .values({ user_id: userId, purpose: 'contact-match', actor: 'user' })
      .execute()
      .catch((error: unknown) => this.logger.error(`주소록 조회 기록 실패: ${String(error)}`));

    const rows = await this.db
      .selectFrom('member.user_phones as p')
      .innerJoin('member.users as u', 'u.id', 'p.user_id')
      .select(['u.id', 'u.public_id', 'u.nickname', 'u.avatar_url', 'p.verified_at'])
      .where('p.phone_hash', 'in', hashes)
      .where('u.phone_discoverable', '=', true)
      .where('u.status', '=', 'active')
      .where('u.id', '!=', userId)
      .where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom('social.friendships as f')
              .select('f.friend_id')
              .whereRef('f.friend_id', '=', 'u.id')
              .where('f.user_id', '=', userId),
          ),
        ),
      )
      .execute();
    if (rows.length === 0) return [];

    const requested = await this.db
      .selectFrom('social.friend_requests')
      .select('to_user_id')
      .where('from_user_id', '=', userId)
      .where(
        'to_user_id',
        'in',
        rows.map((r) => r.id),
      )
      .where('status', '=', 'pending')
      .execute();
    const requestedIds = new Set(requested.map((r) => r.to_user_id));

    return rows.map((r) => ({
      user: { id: r.id, publicId: r.public_id, nickname: r.nickname, avatarUrl: r.avatar_url },
      requested: requestedIds.has(r.id),
      foundAt: now.toISOString(),
    }));
  }
}
