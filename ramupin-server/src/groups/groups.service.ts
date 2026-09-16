import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Transaction } from 'kysely';

import { appError } from '../common/app-error.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import type { MainDatabase, ShareLevel } from '../database/main.schema.js';

/** 앱 src/types/models.ts 의 GroupMember */
export interface GroupMemberResponse {
  id: string;
  publicId: string;
  nickname: string;
  avatarUrl: string | null;
  role: 'owner' | 'member';
  /** 내가 이 사람에게 공유하는 수준 (친구가 아니면 없음) */
  myShareLevel?: ShareLevel;
}

/** 앱 src/types/models.ts 의 GroupDetail */
export interface GroupDetailResponse {
  id: string;
  name: string;
  ownerId: string;
  memberCount: number;
  isPremium: boolean;
  isDirect: boolean;
  createdAt: string;
  members: GroupMemberResponse[];
}

const CREATED_MESSAGE = '그룹채팅을 만들었습니다.';
const MAX_MEMBERS = 50;

const notFound = () => appError(HttpStatus.NOT_FOUND, 'GROUP_NOT_FOUND', '그룹방이 없습니다');

/**
 * 그룹방 (WBS 7). 1:1 대화도 멤버 2명인 그룹방이고 채팅방 id 와 같습니다.
 * TODO(7.1): 그룹 프리미엄 결제, (7.3) 그룹 해지 시 사진 삭제
 */
@Injectable()
export class GroupsService {
  constructor(@Inject(MAIN_DB) private readonly db: MainDb) {}

  /** 내가 속한 그룹방 목록 (최근 대화 순) */
  async list(me: string): Promise<GroupDetailResponse[]> {
    const rows = await this.db
      .selectFrom('social.group_members as gm')
      .innerJoin('social.groups as g', 'g.id', 'gm.group_id')
      .select(['g.id'])
      .where('gm.user_id', '=', me)
      .orderBy('g.updated_at', 'desc')
      .execute();
    return Promise.all(rows.map((row) => this.get(me, row.id)));
  }

  async get(me: string, groupId: string): Promise<GroupDetailResponse> {
    const group = await this.db
      .selectFrom('social.groups')
      .select(['id', 'name', 'owner_id', 'is_premium', 'is_direct', 'created_at'])
      .where('id', '=', groupId)
      .executeTakeFirst();
    if (!group) throw notFound();
    await this.assertMember(groupId, me);

    const members = await this.db
      .selectFrom('social.group_members as gm')
      .innerJoin('member.users as u', 'u.id', 'gm.user_id')
      .leftJoin('social.friend_share_settings as mine', (join) =>
        join.on('mine.owner_id', '=', me).onRef('mine.friend_id', '=', 'gm.user_id'),
      )
      .select(['u.id', 'u.public_id', 'u.nickname', 'u.avatar_url', 'gm.role', 'mine.location_level as my_level'])
      .where('gm.group_id', '=', groupId)
      .orderBy('gm.joined_at')
      .execute();

    return {
      id: group.id,
      // 1:1 방 이름은 상대방 닉네임 (사람마다 다르게 보임)
      name: group.is_direct ? (members.find((m) => m.id !== me)?.nickname ?? group.name) : group.name,
      ownerId: group.owner_id,
      memberCount: members.length,
      isPremium: group.is_premium,
      isDirect: group.is_direct,
      createdAt: new Date(group.created_at).toISOString(),
      members: members.map((m) => ({
        id: m.id,
        publicId: m.public_id,
        nickname: m.nickname,
        avatarUrl: m.avatar_url,
        role: m.role,
        ...(m.my_level ? { myShareLevel: m.my_level } : {}),
      })),
    };
  }

  /** 그룹 만들기: 친구만 초대할 수 있습니다 */
  async create(me: string, name: string, memberIds: string[]): Promise<GroupDetailResponse> {
    const friends = await this.friendIdsOf(me, memberIds);
    if (friends.length !== memberIds.length) throw appError(HttpStatus.BAD_REQUEST, 'NOT_FRIEND', '친구만 초대할 수 있습니다');
    if (friends.length + 1 > MAX_MEMBERS) throw appError(HttpStatus.BAD_REQUEST, 'TOO_MANY_MEMBERS', `멤버는 최대 ${MAX_MEMBERS}명입니다`);

    const groupId = await this.db.transaction().execute(async (trx) => {
      const group = await trx.insertInto('social.groups').values({ name, owner_id: me }).returning('id').executeTakeFirstOrThrow();
      await trx
        .insertInto('social.group_members')
        .values([{ group_id: group.id, user_id: me, role: 'owner' as const }, ...friends.map((id) => ({ group_id: group.id, user_id: id }))])
        .execute();
      await this.systemMessage(trx, group.id, CREATED_MESSAGE);
      return group.id;
    });
    return this.get(me, groupId);
  }

  /** 친구와의 1:1 방 (없으면 만들고, 있으면 그대로) */
  async directRoom(me: string, friendId: string): Promise<GroupDetailResponse> {
    if (me === friendId) throw appError(HttpStatus.BAD_REQUEST, 'CANNOT_CHAT_SELF', '자신과는 대화할 수 없습니다');
    const friends = await this.friendIdsOf(me, [friendId]);
    if (friends.length === 0) throw appError(HttpStatus.BAD_REQUEST, 'NOT_FRIEND', '친구만 대화할 수 있습니다');

    const [userA, userB] = [me, friendId].sort();
    const existing = await this.db
      .selectFrom('social.direct_rooms')
      .select('group_id')
      .where('user_a', '=', userA)
      .where('user_b', '=', userB)
      .executeTakeFirst();
    if (existing) return this.get(me, existing.group_id);

    const groupId = await this.db.transaction().execute(async (trx) => {
      const group = await trx
        .insertInto('social.groups')
        .values({ name: '', owner_id: me, is_direct: true })
        .returning('id')
        .executeTakeFirstOrThrow();
      await trx
        .insertInto('social.group_members')
        .values([
          { group_id: group.id, user_id: me, role: 'owner' as const },
          { group_id: group.id, user_id: friendId },
        ])
        .execute();
      // 동시에 양쪽에서 방을 만들면 한쪽만 남습니다
      const claimed = await trx
        .insertInto('social.direct_rooms')
        .values({ user_a: userA, user_b: userB, group_id: group.id })
        .onConflict((oc) => oc.columns(['user_a', 'user_b']).doNothing())
        .returning('group_id')
        .executeTakeFirst();
      if (!claimed) {
        await trx.deleteFrom('social.groups').where('id', '=', group.id).execute();
        const winner = await trx
          .selectFrom('social.direct_rooms')
          .select('group_id')
          .where('user_a', '=', userA)
          .where('user_b', '=', userB)
          .executeTakeFirstOrThrow();
        return winner.group_id;
      }
      return group.id;
    });
    return this.get(me, groupId);
  }

  async rename(me: string, groupId: string, name: string) {
    const group = await this.assertMember(groupId, me);
    if (group.is_direct) throw appError(HttpStatus.BAD_REQUEST, 'DIRECT_ROOM', '1:1 대화방은 이름을 바꿀 수 없습니다');
    if (group.owner_id !== me) throw appError(HttpStatus.FORBIDDEN, 'NOT_GROUP_OWNER', '방장만 이름을 바꿀 수 있습니다');
    await this.db.updateTable('social.groups').set({ name, updated_at: new Date() }).where('id', '=', groupId).execute();
  }

  /** 친구 초대 (멤버 누구나) */
  async invite(me: string, groupId: string, memberIds: string[]) {
    const group = await this.assertMember(groupId, me);
    if (group.is_direct) throw appError(HttpStatus.BAD_REQUEST, 'DIRECT_ROOM', '1:1 대화방에는 초대할 수 없습니다');
    const friends = await this.friendIdsOf(me, memberIds);
    if (friends.length !== memberIds.length) throw appError(HttpStatus.BAD_REQUEST, 'NOT_FRIEND', '친구만 초대할 수 있습니다');

    const { count } = await this.db
      .selectFrom('social.group_members')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('group_id', '=', groupId)
      .executeTakeFirstOrThrow();
    if (Number(count) + friends.length > MAX_MEMBERS) throw appError(HttpStatus.BAD_REQUEST, 'TOO_MANY_MEMBERS', `멤버는 최대 ${MAX_MEMBERS}명입니다`);

    const added = await this.db.transaction().execute(async (trx) => {
      const rows = await trx
        .insertInto('social.group_members')
        .values(friends.map((id) => ({ group_id: groupId, user_id: id })))
        .onConflict((oc) => oc.doNothing())
        .returning('user_id')
        .execute();
      if (rows.length === 0) return [];
      const names = await trx.selectFrom('member.users').select('nickname').where('id', 'in', rows.map((r) => r.user_id)).execute();
      await this.systemMessage(trx, groupId, `${names.map((n) => n.nickname).join(', ')}님이 들어왔습니다.`);
      return rows.map((r) => r.user_id);
    });
    return { added };
  }

  /**
   * 그룹방 나가기.
   * 방장이 나가면 가장 먼저 들어온 멤버가 방장이 되고, 아무도 없으면 방과 대화가 지워집니다 (WBS 7.3).
   * 기기에 남은 대화는 지우지 않습니다 (WBS 7.6).
   */
  async leave(me: string, groupId: string) {
    const group = await this.assertMember(groupId, me);
    await this.db.transaction().execute(async (trx) => {
      await trx.deleteFrom('social.group_members').where('group_id', '=', groupId).where('user_id', '=', me).execute();
      const rest = await trx
        .selectFrom('social.group_members')
        .select(['user_id'])
        .where('group_id', '=', groupId)
        .orderBy('joined_at')
        .execute();
      if (rest.length === 0) {
        await trx.deleteFrom('social.groups').where('id', '=', groupId).execute();
        return;
      }
      if (group.owner_id === me) {
        await trx.updateTable('social.groups').set({ owner_id: rest[0].user_id }).where('id', '=', groupId).execute();
        await trx.updateTable('social.group_members').set({ role: 'owner' }).where('group_id', '=', groupId).where('user_id', '=', rest[0].user_id).execute();
      }
      const leaver = await trx.selectFrom('member.users').select('nickname').where('id', '=', me).executeTakeFirst();
      await this.systemMessage(trx, groupId, `${leaver?.nickname ?? '알 수 없음'}님이 나갔습니다.`);
    });
  }

  /** 그룹 안에서 내 위치 공유 잠시 끄기 (WBS 7.2) */
  async setLocationPaused(me: string, groupId: string, paused: boolean) {
    await this.assertMember(groupId, me);
    await this.db
      .updateTable('social.group_members')
      .set({ location_paused: paused })
      .where('group_id', '=', groupId)
      .where('user_id', '=', me)
      .execute();
    return { locationPaused: paused };
  }

  async memberIds(groupId: string): Promise<string[]> {
    const rows = await this.db.selectFrom('social.group_members').select('user_id').where('group_id', '=', groupId).execute();
    return rows.map((r) => r.user_id);
  }

  /** 멤버가 아니면 404 (방이 있는지도 알려주지 않음) */
  async assertMember(groupId: string, userId: string) {
    const row = await this.db
      .selectFrom('social.groups as g')
      .innerJoin('social.group_members as gm', 'gm.group_id', 'g.id')
      .select(['g.owner_id', 'g.is_direct'])
      .where('g.id', '=', groupId)
      .where('gm.user_id', '=', userId)
      .executeTakeFirst();
    if (!row) throw notFound();
    return row;
  }

  private async friendIdsOf(me: string, ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .selectFrom('social.friendships')
      .select('friend_id')
      .where('user_id', '=', me)
      .where('friend_id', 'in', ids)
      .execute();
    return rows.map((r) => r.friend_id);
  }

  private async systemMessage(trx: Transaction<MainDatabase>, groupId: string, text: string) {
    await trx.insertInto('chat.messages').values({ room_id: groupId, sender_id: null, type: 'system', text }).execute();
    await trx.updateTable('social.groups').set({ updated_at: new Date() }).where('id', '=', groupId).execute();
  }
}
