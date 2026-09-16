import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Transaction } from 'kysely';

import { appError } from '../common/app-error.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import type { MainDatabase, ShareLevel } from '../database/main.schema.js';
import { toUserSummary, type UserSummary } from '../users/user-summary.js';

/** 앱 src/types/models.ts 의 FriendRequest 와 같은 모양 */
export interface FriendRequestResponse {
  id: string;
  from: UserSummary;
  to: UserSummary;
  status: 'pending' | 'accepted' | 'rejected' | 'canceled';
  message: string | null;
  createdAt: string;
}

/**
 * 친구가 되었을 때 서로에게 공유하는 기본 수준.
 * WBS 6.8: 비공개로 시작 (피그마 완료 문구 "이제 서로의 위치를 알 수 있어요"와 충돌 → docs/wbs-check.md 2-4, 기획 확정 대기)
 */
const DEFAULT_SHARE_LEVEL: ShareLevel = 'hidden';
/** WBS 3.7·4: 이 나이 이상은 1인 가구 모드를 해제하지 않음. TODO(정책): 70/75 확정 후 정책값으로 */
const SENIOR_AGE = 75;
/** 스팸 방지: 24시간 동안 보낼 수 있는 친구 요청 수 */
const DAILY_REQUEST_LIMIT = 50;

const notFound = () => appError(HttpStatus.NOT_FOUND, 'REQUEST_NOT_FOUND', '친구 요청이 없습니다');

function ageOf(birthDate: Date | null): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age -= 1;
  return age;
}

/**
 * 친구 요청 → 수락/거절/취소.
 * TODO(푸시 단계): 요청 받음·수락됨 알림
 * TODO(1인 가구): 친구가 없으면 회사 계정(RamuVia)을 친구로 (WBS 4)
 */
@Injectable()
export class FriendRequestsService {
  constructor(@Inject(MAIN_DB) private readonly db: MainDb) {}

  /** 대기 중인 요청: 받은 것 / 보낸 것 */
  async listPending(me: string): Promise<{ received: FriendRequestResponse[]; sent: FriendRequestResponse[] }> {
    const rows = await this.baseQuery()
      .where('r.status', '=', 'pending')
      .where((eb) => eb.or([eb('r.from_user_id', '=', me), eb('r.to_user_id', '=', me)]))
      .orderBy('r.created_at', 'desc')
      .execute();
    const requests = rows.map(toResponse);
    return {
      received: requests.filter((r) => r.to.id === me),
      sent: requests.filter((r) => r.from.id === me),
    };
  }

  async get(me: string, requestId: string): Promise<FriendRequestResponse> {
    const row = await this.baseQuery()
      .where('r.id', '=', requestId)
      .where((eb) => eb.or([eb('r.from_user_id', '=', me), eb('r.to_user_id', '=', me)]))
      .executeTakeFirst();
    if (!row) throw notFound();
    return toResponse(row);
  }

  /** 친구 요청 보내기. 상대가 이미 나에게 요청했으면 바로 친구가 됩니다 */
  async send(me: string, targetId: string, message?: string | null) {
    if (me === targetId) throw appError(HttpStatus.BAD_REQUEST, 'CANNOT_REQUEST_SELF', '나에게는 친구 요청을 보낼 수 없습니다');

    const target = await this.db.selectFrom('member.users').select('status').where('id', '=', targetId).executeTakeFirst();
    if (!target || target.status !== 'active') throw appError(HttpStatus.NOT_FOUND, 'USER_NOT_FOUND', '사용자가 없습니다');

    const friendship = await this.db
      .selectFrom('social.friendships')
      .select('user_id')
      .where('user_id', '=', me)
      .where('friend_id', '=', targetId)
      .executeTakeFirst();
    if (friendship) throw appError(HttpStatus.CONFLICT, 'ALREADY_FRIENDS', '이미 친구입니다');

    const reverse = await this.db
      .selectFrom('social.friend_requests')
      .select('id')
      .where('from_user_id', '=', targetId)
      .where('to_user_id', '=', me)
      .where('status', '=', 'pending')
      .executeTakeFirst();
    if (reverse) {
      const result = await this.accept(me, reverse.id);
      return { requestId: reverse.id, status: 'accepted' as const, ...result };
    }

    const { count } = await this.db
      .selectFrom('social.friend_requests')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('from_user_id', '=', me)
      .where('created_at', '>', new Date(Date.now() - 86_400_000))
      .executeTakeFirstOrThrow();
    if (Number(count) >= DAILY_REQUEST_LIMIT) {
      throw appError(HttpStatus.TOO_MANY_REQUESTS, 'REQUEST_LIMIT', '오늘 보낼 수 있는 친구 요청 수를 넘었습니다');
    }

    const inserted = await this.db
      .insertInto('social.friend_requests')
      .values({ from_user_id: me, to_user_id: targetId, message: message ?? null })
      // 이미 대기 중인 요청이 있으면 새로 만들지 않음 (부분 유니크 인덱스 friend_requests_pending_uq)
      .onConflict((oc) => oc.columns(['from_user_id', 'to_user_id']).where('status', '=', 'pending').doNothing())
      .returning('id')
      .executeTakeFirst();
    if (inserted) return { requestId: inserted.id, status: 'pending' as const };

    const existing = await this.db
      .selectFrom('social.friend_requests')
      .select('id')
      .where('from_user_id', '=', me)
      .where('to_user_id', '=', targetId)
      .where('status', '=', 'pending')
      .executeTakeFirstOrThrow();
    return { requestId: existing.id, status: 'pending' as const };
  }

  /** 받은 요청 수락: 양방향 친구 + 기본 공유 설정 */
  async accept(me: string, requestId: string): Promise<{ singleHouseholdReleasable: boolean }> {
    return this.db.transaction().execute(async (trx) => {
      const request = await this.lockPending(trx, requestId, (r) => r.to_user_id === me);
      const friendId = request.from_user_id;
      const now = new Date();

      await trx.updateTable('social.friend_requests').set({ status: 'accepted', responded_at: now }).where('id', '=', requestId).execute();
      // 서로 동시에 보낸 요청이 있으면 함께 정리
      await trx
        .updateTable('social.friend_requests')
        .set({ status: 'accepted', responded_at: now })
        .where('from_user_id', '=', me)
        .where('to_user_id', '=', friendId)
        .where('status', '=', 'pending')
        .execute();

      await trx
        .insertInto('social.friendships')
        .values([
          { user_id: me, friend_id: friendId },
          { user_id: friendId, friend_id: me },
        ])
        .onConflict((oc) => oc.doNothing())
        .execute();
      await trx
        .insertInto('social.friend_share_settings')
        .values([
          { owner_id: me, friend_id: friendId, location_level: DEFAULT_SHARE_LEVEL },
          { owner_id: friendId, friend_id: me, location_level: DEFAULT_SHARE_LEVEL },
        ])
        .onConflict((oc) => oc.doNothing())
        .execute();

      // 첫 친구면 1인 가구 모드 해제 안내 대상인지 (75세 이상 제외)
      const user = await trx
        .selectFrom('member.users')
        .select(['single_household', 'birth_date'])
        .where('id', '=', me)
        .executeTakeFirstOrThrow();
      const { count } = await trx
        .selectFrom('social.friendships')
        .select((eb) => eb.fn.countAll<string>().as('count'))
        .where('user_id', '=', me)
        .executeTakeFirstOrThrow();
      const age = ageOf(user.birth_date);
      const singleHouseholdReleasable = user.single_household && Number(count) === 1 && (age === null || age < SENIOR_AGE);
      return { singleHouseholdReleasable };
    });
  }

  async reject(me: string, requestId: string) {
    await this.db.transaction().execute(async (trx) => {
      await this.lockPending(trx, requestId, (r) => r.to_user_id === me);
      await trx.updateTable('social.friend_requests').set({ status: 'rejected', responded_at: new Date() }).where('id', '=', requestId).execute();
    });
  }

  /** 보낸 요청 취소 */
  async cancel(me: string, requestId: string) {
    await this.db.transaction().execute(async (trx) => {
      await this.lockPending(trx, requestId, (r) => r.from_user_id === me);
      await trx.updateTable('social.friend_requests').set({ status: 'canceled', responded_at: new Date() }).where('id', '=', requestId).execute();
    });
  }

  /** 요청을 잠그고 확인: 내 요청이 아니면 404, 이미 처리됐으면 409 */
  private async lockPending(
    trx: Transaction<MainDatabase>,
    requestId: string,
    isMine: (r: { from_user_id: string; to_user_id: string }) => boolean,
  ) {
    const request = await trx
      .selectFrom('social.friend_requests')
      .select(['from_user_id', 'to_user_id', 'status'])
      .where('id', '=', requestId)
      .forUpdate()
      .executeTakeFirst();
    if (!request || !isMine(request)) throw notFound();
    if (request.status !== 'pending') {
      throw appError(HttpStatus.CONFLICT, 'REQUEST_NOT_PENDING', '이미 처리된 친구 요청입니다', { status: request.status });
    }
    return request;
  }

  baseQuery() {
    return this.db
      .selectFrom('social.friend_requests as r')
      .innerJoin('member.users as f', 'f.id', 'r.from_user_id')
      .innerJoin('member.users as t', 't.id', 'r.to_user_id')
      .select([
        'r.id',
        'r.status',
        'r.message',
        'r.created_at',
        'f.id as from_id',
        'f.public_id as from_public_id',
        'f.nickname as from_nickname',
        'f.avatar_url as from_avatar_url',
        'f.last_active_at as from_last_active_at',
        't.id as to_id',
        't.public_id as to_public_id',
        't.nickname as to_nickname',
        't.avatar_url as to_avatar_url',
        't.last_active_at as to_last_active_at',
      ])
      .where('f.status', '=', 'active')
      .where('t.status', '=', 'active');
  }
}

type RequestRow = Awaited<ReturnType<ReturnType<FriendRequestsService['baseQuery']>['executeTakeFirstOrThrow']>>;

function toResponse(row: RequestRow): FriendRequestResponse {
  return {
    id: row.id,
    status: row.status,
    message: row.message,
    createdAt: new Date(row.created_at).toISOString(),
    from: toUserSummary({
      id: row.from_id,
      public_id: row.from_public_id,
      nickname: row.from_nickname,
      avatar_url: row.from_avatar_url,
      last_active_at: row.from_last_active_at,
    }),
    to: toUserSummary({
      id: row.to_id,
      public_id: row.to_public_id,
      nickname: row.to_nickname,
      avatar_url: row.to_avatar_url,
      last_active_at: row.to_last_active_at,
    }),
  };
}
