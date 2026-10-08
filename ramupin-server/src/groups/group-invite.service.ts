import { randomBytes } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';

import { appError } from '../common/app-error.js';
import { env } from '../config/env.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { GroupsService } from './groups.service.js';

/**
 * 그룹방 초대 링크 (피그마 사람들 605 · 친구 요청 플로우 738, 2026-10-08).
 *
 * 친구 초대(`groups.invite`)는 **친구만** 넣을 수 있지만, 링크는 받은 사람 누구나 수락할 수 있습니다 —
 * 카카오톡 초대 링크처럼 아직 친구가 아닌 사람을 부르는 용도입니다. 그래서
 *   - 7일이 지나면 막힙니다
 *   - **만든 사람이 그 방을 나가면** 막힙니다 (열 때마다 확인 — 0032 설명)
 *   - 1:1 대화방에는 만들 수 없습니다
 */

/** 링크가 살아 있는 기간 */
const TTL_DAYS = 7;
/** 주소에 들어가는 값의 길이(바이트). 18바이트 = 144비트, 맞혀서 열 수 없습니다 */
const TOKEN_BYTES = 18;

export interface InvitePreview {
  token: string;
  group: { id: string; name: string; memberCount: number; memberNames: string[] };
  inviter: { nickname: string };
  createdAt: string;
  expiresAt: string;
  /** 이미 그 방에 있으면 수락 버튼 대신 '들어가기' */
  alreadyMember: boolean;
}

@Injectable()
export class GroupInviteService {
  constructor(
    @Inject(MAIN_DB) private readonly db: MainDb,
    private readonly groups: GroupsService,
  ) {}

  /** 링크 만들기 (또는 내가 만든 살아 있는 링크 돌려주기 — 누를 때마다 주소가 늘지 않게) */
  async create(me: string, groupId: string, now = new Date()): Promise<{ url: string; token: string; expiresAt: string }> {
    const group = await this.groups.assertMember(groupId, me);
    if (group.is_direct) throw appError(HttpStatus.BAD_REQUEST, 'DIRECT_ROOM', '1:1 대화방에는 초대할 수 없습니다');

    const existing = await this.db
      .selectFrom('social.group_invites')
      .select(['token', 'expires_at'])
      .where('group_id', '=', groupId)
      .where('created_by', '=', me)
      .where('revoked_at', 'is', null)
      .where('expires_at', '>', now)
      .orderBy('created_at', 'desc')
      .executeTakeFirst();
    if (existing) return this.link(existing.token, existing.expires_at);

    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const expiresAt = new Date(now.getTime() + TTL_DAYS * 24 * 60 * 60 * 1000);
    await this.db.insertInto('social.group_invites').values({ token, group_id: groupId, created_by: me, expires_at: expiresAt }).execute();
    return this.link(token, expiresAt);
  }

  /** 받은 사람이 보는 초대 내용 (피그마 738 '그룹방 초대' 카드) */
  async preview(me: string, token: string, now = new Date()): Promise<InvitePreview> {
    const invite = await this.alive(token, now);
    const members = await this.db
      .selectFrom('social.group_members as gm')
      .innerJoin('member.users as u', 'u.id', 'gm.user_id')
      .select(['u.id', 'u.nickname'])
      .where('gm.group_id', '=', invite.group_id)
      .orderBy('gm.joined_at')
      .execute();
    return {
      token,
      group: { id: invite.group_id, name: invite.name, memberCount: members.length, memberNames: members.slice(0, 4).map((m) => m.nickname) },
      inviter: { nickname: invite.inviter },
      createdAt: invite.created_at.toISOString(),
      expiresAt: invite.expires_at.toISOString(),
      alreadyMember: members.some((m) => m.id === me),
    };
  }

  /** 수락 — 방에 들어갑니다. 이미 있으면 그대로 둡니다 */
  async accept(me: string, token: string, now = new Date()): Promise<{ groupId: string; joined: boolean }> {
    const invite = await this.alive(token, now);
    const joined = await this.groups.joinByInvite(me, invite.group_id);
    return { groupId: invite.group_id, joined };
  }

  /** 살아 있는 초대인지 확인 (만료·끔·만든 사람이 나감·방이 없어짐) */
  private async alive(token: string, now: Date) {
    const invite = await this.db
      .selectFrom('social.group_invites as i')
      .innerJoin('social.groups as g', 'g.id', 'i.group_id')
      .innerJoin('member.users as u', 'u.id', 'i.created_by')
      // 만든 사람이 아직 그 방에 있어야 합니다
      .innerJoin('social.group_members as gm', (join) => join.onRef('gm.group_id', '=', 'i.group_id').onRef('gm.user_id', '=', 'i.created_by'))
      .select(['i.group_id', 'i.expires_at', 'i.created_at', 'g.name', 'u.nickname as inviter'])
      .where('i.token', '=', token)
      .where('i.revoked_at', 'is', null)
      .where('i.expires_at', '>', now)
      .executeTakeFirst();
    if (!invite) throw appError(HttpStatus.NOT_FOUND, 'INVITE_INVALID', '만료되었거나 더 이상 쓸 수 없는 초대 링크입니다');
    return invite;
  }

  private link(token: string, expiresAt: Date) {
    return { url: `${env.PUBLIC_LINK_URL}/g/${token}`, token, expiresAt: expiresAt.toISOString() };
  }
}
