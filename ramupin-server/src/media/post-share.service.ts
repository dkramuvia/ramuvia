import { randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { appError } from '../common/app-error.js';
import { env } from '../config/env.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { StorageService } from './storage.service.js';

/**
 * 사진 공유 링크 (WBS 6).
 *
 * 그룹 밖 사람에게 사진을 보여 주는 주소입니다. 로그인 없이 열립니다.
 *
 * **무효화를 따로 청소하지 않습니다.** 열어 볼 때마다 게시물이 살아 있는지와
 * **만든 사람이 아직 그 그룹에 있는지**를 봅니다. 그룹에서 나가거나 그룹이 없어지면
 * 링크가 저절로 막힙니다. 그룹이 바뀔 때마다 링크를 찾아 지우는 방식은 한 군데라도
 * 빠뜨리면 나간 사람이 만든 링크가 계속 열립니다.
 */

/** 링크가 살아 있는 기간. 사진 주소가 영원히 살아 있으면 그 자체가 위험합니다 */
const TTL_DAYS = 7;

/**
 * 주소에 들어가는 값의 길이(바이트).
 *
 * 24바이트 = 192비트입니다. 맞혀서 열어 보는 것은 사실상 불가능합니다.
 * 짧게 잡으면 주소를 훑어 남의 사진을 찾아낼 수 있습니다.
 */
const TOKEN_BYTES = 24;

export interface SharedPost {
  id: string;
  placeName: string | null;
  createdAt: string;
  author: { nickname: string };
  media: { id: string; type: string; uri: string }[];
}

@Injectable()
export class PostShareService {
  constructor(
    @Inject(MAIN_DB) private readonly db: MainDb,
    private readonly storage: StorageService,
  ) {}

  /**
   * 링크 만들기 (또는 이미 있는 것 돌려주기).
   *
   * 누를 때마다 새로 만들면 주소가 계속 늘어나고, 하나를 껐는데 다른 주소로 열리는
   * 일이 생깁니다.
   */
  async create(userId: string, postId: string, now = new Date()): Promise<{ url: string; expiresAt: string }> {
    // 내가 그 그룹에 있어야 만들 수 있습니다
    const post = await this.db
      .selectFrom('media.posts as p')
      .innerJoin('social.group_members as gm', 'gm.group_id', 'p.group_id')
      .select('p.id')
      .where('p.id', '=', postId)
      .where('p.deleted_at', 'is', null)
      .where('gm.user_id', '=', userId)
      .executeTakeFirst();
    if (!post) throw appError(404, 'POST_NOT_FOUND', '게시물이 없습니다');

    const existing = await this.db
      .selectFrom('media.post_shares')
      .select(['token', 'expires_at'])
      .where('post_id', '=', postId)
      .where('created_by', '=', userId)
      .where('revoked_at', 'is', null)
      .where('expires_at', '>', now)
      .executeTakeFirst();
    if (existing) return { url: this.urlOf(existing.token), expiresAt: existing.expires_at.toISOString() };

    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const expiresAt = new Date(now.getTime() + TTL_DAYS * 24 * 60 * 60_000);
    await this.db
      .insertInto('media.post_shares')
      .values({ token, post_id: postId, created_by: userId, expires_at: expiresAt })
      .execute();
    return { url: this.urlOf(token), expiresAt: expiresAt.toISOString() };
  }

  /** 링크 끄기. 내가 만든 것만 */
  async revoke(userId: string, postId: string, now = new Date()): Promise<{ ok: true }> {
    await this.db
      .updateTable('media.post_shares')
      .set({ revoked_at: now })
      .where('post_id', '=', postId)
      .where('created_by', '=', userId)
      .where('revoked_at', 'is', null)
      .execute();
    return { ok: true };
  }

  /**
   * 링크로 사진 보기 (로그인 없이).
   *
   * **좌표는 주지 않습니다.** 사진이 찍힌 정확한 위치가 링크만 있으면 누구에게나
   * 보이게 되는 것은 위험합니다. 장소 이름까지만 보여 줍니다.
   */
  async view(token: string, now = new Date()): Promise<SharedPost> {
    const row = await this.db
      .selectFrom('media.post_shares as s')
      .innerJoin('media.posts as p', 'p.id', 's.post_id')
      .innerJoin('member.users as u', 'u.id', 'p.author_id')
      // 만든 사람이 **아직 그 그룹에 있어야** 합니다. 나가면 링크가 저절로 막힙니다
      .innerJoin('social.group_members as gm', (join) =>
        join.onRef('gm.group_id', '=', 'p.group_id').onRef('gm.user_id', '=', 's.created_by'),
      )
      .select(['p.id', 'p.place_name', 'p.created_at', 'u.nickname'])
      .where('s.token', '=', token)
      .where('s.revoked_at', 'is', null)
      .where('s.expires_at', '>', now)
      .where('p.deleted_at', 'is', null)
      .executeTakeFirst();
    // 없는 것과 만료된 것을 구분해 주지 않습니다 — 주소를 훑는 사람에게 힌트가 됩니다
    if (!row) throw appError(404, 'SHARE_NOT_FOUND', '링크가 만료되었거나 없습니다');

    const assets = await this.db
      .selectFrom('media.post_assets as pa')
      .innerJoin('media.assets as a', 'a.id', 'pa.asset_id')
      .select(['a.id', 'a.object_key', 'a.kind'])
      .where('pa.post_id', '=', row.id)
      .orderBy('pa.position')
      .execute();

    return {
      id: row.id,
      placeName: row.place_name,
      createdAt: row.created_at.toISOString(),
      author: { nickname: row.nickname },
      media: await Promise.all(
        assets.map(async (a) => ({ id: a.id, type: a.kind, uri: (await this.storage.viewUrl(a.object_key)) ?? '' })),
      ),
    };
  }

  private urlOf(token: string): string {
    return `${env.PUBLIC_WEB_URL}/p/${token}`;
  }
}
