import type { MainDb } from '../database/main-database.module.js';

/**
 * 두 사람 사이에 차단이 있는지 (어느 쪽이 막았든). 보완 4.11.
 *
 * 차단은 양방향으로 끊습니다: 막은 사람도 막힌 사람도 서로 친구 요청·1:1 대화를 할 수 없습니다.
 * 막힌 사람에게는 "차단됨" 이라고 알리지 않으므로, 부르는 쪽은 "사용자가 없습니다" 처럼 답합니다.
 */
export async function isBlockedBetween(db: MainDb, a: string, b: string): Promise<boolean> {
  const row = await db
    .selectFrom('social.blocks')
    .select('blocker_id')
    .where((eb) =>
      eb.or([eb.and([eb('blocker_id', '=', a), eb('blocked_id', '=', b)]), eb.and([eb('blocker_id', '=', b), eb('blocked_id', '=', a)])]),
    )
    .executeTakeFirst();
  return row !== undefined;
}
