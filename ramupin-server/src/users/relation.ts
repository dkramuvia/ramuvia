import type { MainDb } from '../database/main-database.module.js';
import { USER_SUMMARY_COLUMNS, toUserSummary } from './user-summary.js';

/**
 * "이 사람과 나는 무슨 사이인가".
 *
 * 8자리 ID 로 찾을 때와 QR 로 찾을 때 같은 답이 나와야 해서 한 곳에 둡니다.
 * 앱은 이 값으로 버튼을 정합니다 — 이미 친구면 "친구 추가"를 띄우면 안 됩니다.
 */

export type Relation = 'self' | 'friend' | 'request_sent' | 'request_received' | 'none';

export async function relationBetween(db: MainDb, me: string, other: string): Promise<Relation> {
  if (me === other) return 'self';

  const friend = await db
    .selectFrom('social.friendships')
    .select('user_id')
    .where('user_id', '=', me)
    .where('friend_id', '=', other)
    .executeTakeFirst();
  if (friend) return 'friend';

  const pending = await db
    .selectFrom('social.friend_requests')
    .select('from_user_id')
    .where('status', '=', 'pending')
    .where((eb) =>
      eb.or([
        eb.and([eb('from_user_id', '=', me), eb('to_user_id', '=', other)]),
        eb.and([eb('from_user_id', '=', other), eb('to_user_id', '=', me)]),
      ]),
    )
    .executeTakeFirst();
  if (!pending) return 'none';
  return pending.from_user_id === me ? 'request_sent' : 'request_received';
}

/** 사용자 요약 + 나와의 관계 (친구 추가 화면이 그대로 쓰는 모양) */
export async function summaryWithRelation(db: MainDb, me: string, otherId: string) {
  const row = await db
    .selectFrom('member.users')
    .select(USER_SUMMARY_COLUMNS)
    .where('id', '=', otherId)
    .where('status', '=', 'active')
    .executeTakeFirst();
  if (!row) return null;
  return { ...toUserSummary(row), relation: await relationBetween(db, me, row.id) };
}
