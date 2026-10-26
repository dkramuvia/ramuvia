import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';

import { appError } from '../common/app-error.js';
import { policyNumber, resolvePolicy } from '../config/policy.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { StorageService } from '../media/storage.service.js';
import { PushService } from '../push/push.service.js';

/**
 * 그룹 멤버 관리 · 그룹 설정 (보완 화면 설계 4.19·4.20).
 *
 * 역할 권한
 *   방장   = 모든 권한 (관리자 지정·해제, 방장 넘기기, 내보내기, 그룹 설정, 그룹 삭제)
 *   관리자 = 초대·내보내기 (방장·다른 관리자는 내보낼 수 없음)
 *   멤버   = 보기·사진·대화
 * 내보낸 멤버는 바로 그룹 지도·사진·대화에 접근할 수 없고 알림을 받습니다.
 */

export type GroupRole = 'owner' | 'admin' | 'member';

export interface GroupSettingsInput {
  invitePermission?: 'all' | 'admins';
  photoPermission?: 'all' | 'admins';
  defaultShareLevel?: 'exact' | 'blurred';
}

/** 그룹 최대 인원 기본값 (정책에 값이 없을 때) */
export const DEFAULT_GROUP_MEMBER_LIMIT = 50;

@Injectable()
export class GroupAdminService {
  private readonly logger = new Logger(GroupAdminService.name);

  constructor(
    @Inject(MAIN_DB) private readonly db: MainDb,
    private readonly storage: StorageService,
    private readonly push: PushService,
  ) {}

  /** 그룹 최대 인원 = 방장 등급 정책 (보완 4.20) */
  async memberLimit(groupId: string): Promise<number> {
    const group = await this.db.selectFrom('social.groups').select('owner_id').where('id', '=', groupId).executeTakeFirst();
    if (!group) return DEFAULT_GROUP_MEMBER_LIMIT;
    return policyNumber(await resolvePolicy(this.db, group.owner_id), 'groupMemberLimit', DEFAULT_GROUP_MEMBER_LIMIT);
  }

  /** 내 역할. 멤버가 아니면 404 */
  async roleOf(groupId: string, userId: string): Promise<{ role: GroupRole; name: string; isDirect: boolean }> {
    const row = await this.db
      .selectFrom('social.group_members as gm')
      .innerJoin('social.groups as g', 'g.id', 'gm.group_id')
      .select(['gm.role', 'g.name', 'g.is_direct'])
      .where('gm.group_id', '=', groupId)
      .where('gm.user_id', '=', userId)
      .executeTakeFirst();
    if (!row) throw appError(HttpStatus.NOT_FOUND, 'GROUP_NOT_FOUND', '그룹방이 없습니다');
    if (row.is_direct) throw appError(HttpStatus.BAD_REQUEST, 'DIRECT_ROOM', '1:1 대화방에서는 할 수 없습니다');
    return { role: row.role, name: row.name, isDirect: row.is_direct };
  }

  /** 초대할 수 있는지 (그룹 설정 "멤버 초대") */
  async assertCanInvite(groupId: string, userId: string) {
    const { role } = await this.roleOf(groupId, userId);
    if (role !== 'member') return;
    const group = await this.db.selectFrom('social.groups').select('invite_permission').where('id', '=', groupId).executeTakeFirstOrThrow();
    if (group.invite_permission === 'admins') throw appError(HttpStatus.FORBIDDEN, 'INVITE_NOT_ALLOWED', '방장·관리자만 초대할 수 있어요');
  }

  /** 관리자 지정·해제 (방장만) */
  async setRole(me: string, groupId: string, targetId: string, role: 'admin' | 'member') {
    await this.assertOwner(groupId, me);
    if (targetId === me) throw appError(HttpStatus.BAD_REQUEST, 'CANNOT_CHANGE_SELF', '방장은 자기 역할을 바꿀 수 없어요');
    const updated = await this.db
      .updateTable('social.group_members')
      .set({ role })
      .where('group_id', '=', groupId)
      .where('user_id', '=', targetId)
      .where('role', '!=', 'owner')
      .returning('user_id')
      .executeTakeFirst();
    if (!updated) throw appError(HttpStatus.NOT_FOUND, 'MEMBER_NOT_FOUND', '그룹 멤버가 아닙니다');
    return { ok: true };
  }

  /** 방장 넘기기 (방장만). 이전 방장은 관리자가 됩니다 */
  async transferOwner(me: string, groupId: string, targetId: string) {
    await this.assertOwner(groupId, me);
    if (targetId === me) throw appError(HttpStatus.BAD_REQUEST, 'ALREADY_OWNER', '이미 방장입니다');
    await this.db.transaction().execute(async (trx) => {
      const target = await trx
        .updateTable('social.group_members')
        .set({ role: 'owner' })
        .where('group_id', '=', groupId)
        .where('user_id', '=', targetId)
        .returning('user_id')
        .executeTakeFirst();
      if (!target) throw appError(HttpStatus.NOT_FOUND, 'MEMBER_NOT_FOUND', '그룹 멤버가 아닙니다');
      await trx.updateTable('social.group_members').set({ role: 'admin' }).where('group_id', '=', groupId).where('user_id', '=', me).execute();
      await trx.updateTable('social.groups').set({ owner_id: targetId, updated_at: new Date() }).where('id', '=', groupId).execute();
      const names = await trx.selectFrom('member.users').select('nickname').where('id', '=', targetId).executeTakeFirst();
      await trx
        .insertInto('chat.messages')
        .values({ room_id: groupId, sender_id: null, type: 'system', text: `${names?.nickname ?? '알 수 없음'}님이 방장이 되었습니다.` })
        .execute();
    });
    return { ok: true };
  }

  /**
   * 그룹에서 내보내기. 방장은 누구나(자기 빼고), 관리자는 일반 멤버만.
   * 내보낸 사람에게 알림을 보냅니다 ("그룹에서 나가게 되었어요").
   */
  async kick(me: string, groupId: string, targetId: string) {
    const { role, name } = await this.roleOf(groupId, me);
    if (role === 'member') throw appError(HttpStatus.FORBIDDEN, 'NOT_GROUP_ADMIN', '방장·관리자만 내보낼 수 있어요');
    if (targetId === me) throw appError(HttpStatus.BAD_REQUEST, 'CANNOT_KICK_SELF', '나는 내보낼 수 없어요. 그룹방 나가기를 이용해 주세요');
    const target = await this.db
      .selectFrom('social.group_members as gm')
      .innerJoin('member.users as u', 'u.id', 'gm.user_id')
      .select(['gm.role', 'u.nickname'])
      .where('gm.group_id', '=', groupId)
      .where('gm.user_id', '=', targetId)
      .executeTakeFirst();
    if (!target) throw appError(HttpStatus.NOT_FOUND, 'MEMBER_NOT_FOUND', '그룹 멤버가 아닙니다');
    if (target.role === 'owner' || (role === 'admin' && target.role === 'admin')) {
      throw appError(HttpStatus.FORBIDDEN, 'CANNOT_KICK', '방장이나 다른 관리자는 내보낼 수 없어요');
    }

    await this.db.transaction().execute(async (trx) => {
      await trx.deleteFrom('social.group_members').where('group_id', '=', groupId).where('user_id', '=', targetId).execute();
      // SOS 수신 그룹으로 이 그룹을 골라 둔 것은 그대로 두되(그룹 멤버로 계산), 내보낸 사람의 공유 중지는 멤버 표에서 빠지며 끝납니다
      await trx
        .insertInto('chat.messages')
        .values({ room_id: groupId, sender_id: null, type: 'system', text: `${target.nickname}님을 그룹에서 내보냈습니다.` })
        .execute();
      await trx.updateTable('social.groups').set({ updated_at: new Date() }).where('id', '=', groupId).execute();
    });

    await this.push
      .sendToUsers([targetId], {
        title: '라무핀',
        body: `'${name}' 그룹에서 나가게 되었어요`,
        channel: 'general',
        route: '/people',
        data: { kind: 'groupKicked', groupId },
      })
      .catch((error: unknown) => this.logger.error(`내보내기 알림 실패: ${String(error)}`));
    return { ok: true };
  }

  /** 그룹 설정 (방장만): 초대·사진 권한, 그룹 기본 위치 공개 */
  async updateSettings(me: string, groupId: string, input: GroupSettingsInput) {
    await this.assertOwner(groupId, me);
    const patch = {
      ...(input.invitePermission ? { invite_permission: input.invitePermission } : {}),
      ...(input.photoPermission ? { photo_permission: input.photoPermission } : {}),
      ...(input.defaultShareLevel ? { default_share_level: input.defaultShareLevel } : {}),
    };
    if (Object.keys(patch).length > 0) await this.db.updateTable('social.groups').set(patch).where('id', '=', groupId).execute();
    return { ok: true };
  }

  /**
   * 그룹 삭제 (방장만): 사진·대화를 모두 지웁니다. 멤버에게 먼저 알립니다.
   * 저장소의 사진 파일도 지웁니다 (표만 지우면 파일이 남아 용량과 비용이 나갑니다).
   */
  async remove(me: string, groupId: string): Promise<string[]> {
    const { name } = await this.roleOf(groupId, me);
    await this.assertOwner(groupId, me);

    const members = (await this.db.selectFrom('social.group_members').select('user_id').where('group_id', '=', groupId).execute()).map((m) => m.user_id);
    const postAssets = this.db
      .selectFrom('media.post_assets as pa')
      .innerJoin('media.posts as p', 'p.id', 'pa.post_id')
      .select('pa.asset_id')
      .where('p.group_id', '=', groupId);
    const chatAssets = this.db.selectFrom('chat.messages').select('asset_id').where('room_id', '=', groupId).where('asset_id', 'is not', null);
    const assets = await this.db
      .selectFrom('media.assets')
      .select(['id', 'object_key'])
      .where((eb) => eb.or([eb('id', 'in', postAssets), eb('id', 'in', chatAssets as never)]))
      .execute();

    await this.db.transaction().execute(async (trx) => {
      // 그룹을 지우면 게시물·대화·멤버는 함께 지워집니다 (외래키 CASCADE). 파일 기록은 따로 지웁니다
      await trx.deleteFrom('social.groups').where('id', '=', groupId).execute();
      if (assets.length) await trx.deleteFrom('media.assets').where('id', 'in', assets.map((a) => a.id)).execute();
      // SOS 수신 그룹으로 골라 둔 것도 지웁니다 (외래키가 없어 남습니다)
      await trx.deleteFrom('member.sos_recipients').where('kind', '=', 'group').where('target_id', '=', groupId).execute();
    });
    for (const a of assets) await this.storage.remove(a.object_key).catch(() => undefined);

    const others = members.filter((id) => id !== me);
    await this.push
      .sendToUsers(others, { title: '라무핀', body: `'${name}' 그룹이 삭제되었어요`, channel: 'general', route: '/people', data: { kind: 'groupDeleted', groupId } })
      .catch((error: unknown) => this.logger.error(`그룹 삭제 알림 실패: ${String(error)}`));
    return members;
  }

  private async assertOwner(groupId: string, userId: string) {
    const { role } = await this.roleOf(groupId, userId);
    if (role !== 'owner') throw appError(HttpStatus.FORBIDDEN, 'NOT_GROUP_OWNER', '방장만 할 수 있어요');
  }
}
