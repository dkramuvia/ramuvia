import { Body, Controller, Delete, Get, Inject, Module, NotFoundException, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { AuthGuard, CurrentUser, type AuthUser } from '../auth/auth.guard.js';
import { appError, parseInput } from '../common/app-error.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { policyNumber, resolvePolicy } from '../config/policy.js';
import { displayGroupName } from '../groups/group-name.js';
import { PostShareService } from './post-share.service.js';
import { StorageService } from './storage.service.js';

/**
 * 사진·동영상 공유 (WBS 5.6 ~ 6.1).
 *
 * 흐름: 올릴 주소 요청 → 앱이 저장소에 직접 업로드 → 게시물 만들기.
 * 파일이 API 서버를 지나가지 않아, 동영상을 여러 명이 동시에 올려도 서버가 버팁니다.
 */

const MAX_MEDIA_PER_POST = 10;

const targetsBody = z.object({
  files: z
    .array(z.object({ contentType: z.string().min(3).max(100), bytes: z.number().int().positive() }))
    .min(1)
    .max(MAX_MEDIA_PER_POST),
});

/** 한 번에 올릴 수 있는 그룹방 수 */
const MAX_GROUPS_PER_UPLOAD = 10;

const createPostBody = z.object({
  /** 예전 앱 (한 그룹). groupIds 와 같이 오면 groupIds 를 씁니다 */
  groupId: z.uuid().optional(),
  /**
   * 여러 그룹방에 한 번에 올리기 (피그마 갤러리 583, 10-08).
   * 그룹마다 게시물이 하나씩 생기고 사진 파일은 함께 씁니다 — 한 그룹에서 지워도 다른 그룹에는 남습니다
   */
  groupIds: z.array(z.uuid()).min(1).max(MAX_GROUPS_PER_UPLOAD).optional(),
  assetIds: z.array(z.uuid()).min(1).max(MAX_MEDIA_PER_POST),
  place: z
    .object({
      /** 장소명(예: 삼성 코엑스). 특정되지 않으면 주소만 씁니다 */
      placeName: z.string().max(200).nullish(),
      address: z.string().max(300),
      latitude: z.number(),
      longitude: z.number(),
    })
    .nullish(),
  /** 긴급 공지로 올릴 때만 (WBS 5.9). 제목이 있으면 목록 맨 위에 큰 글씨로 나옵니다 */
  emergencyNotice: z.object({ title: z.string().min(1).max(100), message: z.string().max(500) }).nullish(),
});

@Controller('gallery')
@UseGuards(AuthGuard)
class GalleryController {
  constructor(
    @Inject(MAIN_DB) private readonly db: MainDb,
    private readonly storage: StorageService,
    private readonly shares: PostShareService,
  ) {}

  /**
   * 1단계: 올릴 주소 받기.
   * 등급별 용량(photoStorageMb)을 여기서 확인합니다. 다 쓴 사람에게는 주소를 주지 않습니다.
   */
  @Post('upload-targets')
  async uploadTargets(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    if (!this.storage.enabled) throw appError(503, 'STORAGE_OFF', '저장소가 설정되지 않았습니다');
    const { files } = parseInput(targetsBody, body);

    // 올릴 주소만 받고 안 올린 찌꺼기를 먼저 치웁니다. 그냥 두면 용량 계산과 표가 지저분해집니다
    await this.dropStalePending(user.id);

    // SOS 녹음은 용량 제한을 걸지 않습니다. 긴급 상황에 "용량이 찼다"고 거절하면 안 됩니다 (WBS 7.9)
    const emergencyOnly = files.every((f) => f.contentType.startsWith('audio/'));
    if (!emergencyOnly) {
      const limitMb = await this.storageLimitMb(user.id);
      if (limitMb <= 0) throw appError(403, 'PLAN_NO_PHOTO', '사진 공유를 쓸 수 없는 등급입니다');

      const used = await this.usedBytes(user.id);
      const adding = files.reduce((sum, f) => sum + f.bytes, 0);
      if (used + adding > limitMb * 1024 * 1024) {
        throw appError(403, 'STORAGE_FULL', '공유 용량이 가득 찼습니다', {
          usedMb: Math.round((used / 1024 / 1024) * 10) / 10,
          limitMb,
        });
      }
    }

    const targets = [];
    for (const file of files) {
      const target = await this.storage.createUploadTarget(user.id, file.contentType);
      if (!target) throw appError(400, 'UNSUPPORTED_TYPE', `올릴 수 없는 형식입니다: ${file.contentType}`);

      // 아직 파일은 없습니다. 실제로 올라왔는지는 다음 단계에서 저장소에 직접 확인합니다
      const row = await this.db
        .insertInto('media.assets')
        .values({
          owner_id: user.id,
          object_key: target.objectKey,
          kind: target.kind,
          content_type: file.contentType,
          bytes: file.bytes,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      targets.push({ assetId: row.id, uploadUrl: target.uploadUrl, contentType: file.contentType });
    }
    return { targets };
  }

  /**
   * 2단계: 게시물 만들기.
   * 앱이 "다 올렸다"고 해도 믿지 않고, 저장소에 실제로 있는지·크기가 맞는지 확인합니다.
   */
  @Post('posts')
  async createPost(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = parseInput(createPostBody, body);
    const groupIds = [...new Set(input.groupIds ?? (input.groupId ? [input.groupId] : []))];
    if (groupIds.length === 0) throw appError(400, 'GROUP_REQUIRED', '그룹방을 골라 주세요');
    for (const groupId of groupIds) await this.assertGroupMember(user.id, groupId);

    const assets = await this.db
      .selectFrom('media.assets')
      .select(['id', 'object_key', 'bytes'])
      .where('id', 'in', input.assetIds)
      .where('owner_id', '=', user.id)
      .execute();
    if (assets.length !== input.assetIds.length) throw appError(400, 'ASSET_MISSING', '올라가지 않은 파일이 있습니다');

    for (const asset of assets) {
      const real = await this.storage.verifyUpload(asset.object_key);
      if (!real) throw appError(400, 'ASSET_MISSING', '올라가지 않은 파일이 있습니다');
      await this.db
        .updateTable('media.assets')
        // 신고한 크기 대신 실제 크기로 고쳐 둡니다 (용량 제한을 우회하지 못하게)
        .set({ uploaded_at: new Date(), bytes: real.bytes })
        .where('id', '=', asset.id)
        .execute();
    }

    const postIds: string[] = [];
    for (const groupId of groupIds) {
      const post = await this.db
        .insertInto('media.posts')
        .values({
          group_id: groupId,
          author_id: user.id,
          place_name: input.place?.placeName ?? null,
          place_address: input.place?.address ?? null,
          latitude: input.place?.latitude ?? null,
          longitude: input.place?.longitude ?? null,
          emergency_title: input.emergencyNotice?.title ?? null,
          emergency_message: input.emergencyNotice?.message ?? null,
        })
        .returning('id')
        .executeTakeFirstOrThrow();

      await this.db
        .insertInto('media.post_assets')
        .values(input.assetIds.map((assetId, position) => ({ post_id: post.id, asset_id: assetId, position })))
        .execute();
      postIds.push(post.id);
    }

    // 예전 앱은 게시물 하나를 받습니다. groupIds 로 보낸 앱에는 목록을 돌려줍니다
    const posts = await Promise.all(postIds.map((id) => this.postById(id, user.id)));
    return input.groupIds ? { posts } : posts[0];
  }

  /** 내가 속한 그룹의 게시물. 긴급 공지가 먼저, 그다음 최신순 (WBS 5.9) */
  @Get('posts')
  async feed(@CurrentUser() user: AuthUser, @Query('groupId') groupId?: string) {
    let query = this.db
      .selectFrom('media.posts as p')
      .innerJoin('social.group_members as gm', 'gm.group_id', 'p.group_id')
      .innerJoin('social.groups as g', 'g.id', 'p.group_id')
      .innerJoin('member.users as u', 'u.id', 'p.author_id')
      .select([
        'p.id',
        'p.group_id as groupId',
        'g.name as groupName',
        'p.place_name as placeName',
        'p.place_address as placeAddress',
        'p.latitude',
        'p.longitude',
        'p.emergency_title as emergencyTitle',
        'p.emergency_message as emergencyMessage',
        'p.created_at as createdAt',
        'u.id as authorId',
        'u.nickname',
        'u.avatar_url as avatarUrl',
      ])
      .where('gm.user_id', '=', user.id)
      .where('p.deleted_at', 'is', null)
      // 긴급 공지가 먼저 (WBS 5.9)
      .orderBy((eb) => eb.case().when('p.emergency_title', 'is not', null).then(0).else(1).end(), 'asc')
      .orderBy('p.created_at', 'desc')
      .limit(100);
    if (groupId) query = query.where('p.group_id', '=', groupId);

    const rows = await query.execute();
    return Promise.all(rows.map((row) => this.withMedia(row, user.id)));
  }

  /** 한 사람이 올린 것 모아 보기 (WBS 6.1). 같은 그룹에 있는 사람만 볼 수 있습니다 */
  @Get('users/:userId/posts')
  async userPosts(@CurrentUser() user: AuthUser, @Param('userId', ParseUUIDPipe) userId: string) {
    const rows = await this.db
      .selectFrom('media.posts as p')
      .innerJoin('social.group_members as mine', 'mine.group_id', 'p.group_id')
      .innerJoin('social.groups as g', 'g.id', 'p.group_id')
      .innerJoin('member.users as u', 'u.id', 'p.author_id')
      .select([
        'p.id',
        'p.group_id as groupId',
        'g.name as groupName',
        'p.place_name as placeName',
        'p.place_address as placeAddress',
        'p.latitude',
        'p.longitude',
        'p.emergency_title as emergencyTitle',
        'p.emergency_message as emergencyMessage',
        'p.created_at as createdAt',
        'u.id as authorId',
        'u.nickname',
        'u.avatar_url as avatarUrl',
      ])
      .where('mine.user_id', '=', user.id)
      .where('p.author_id', '=', userId)
      .where('p.deleted_at', 'is', null)
      .orderBy('p.created_at', 'desc')
      .limit(100)
      .execute();
    return Promise.all(rows.map((row) => this.withMedia(row, user.id)));
  }

  /** 내가 올린 것만 지울 수 있습니다. 기록은 남기고 목록에서만 뺍니다 */
  @Delete('posts/:id')
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const result = await this.db
      .updateTable('media.posts')
      .set({ deleted_at: new Date() })
      .where('id', '=', id)
      .where('author_id', '=', user.id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!Number(result.numUpdatedRows)) throw new NotFoundException();
    return { ok: true };
  }

  /** 내가 쓴 용량 (설정 화면에서 보여 줍니다) */
  /**
   * 사진 공유 링크 만들기 (WBS 6).
   * 이미 만들어 둔 살아 있는 링크가 있으면 그것을 돌려줍니다 (주소가 늘어나지 않게).
   */
  @Post('posts/:id/share')
  createShare(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.shares.create(user.id, id);
  }

  /** 내가 만든 공유 링크 끄기 */
  @Delete('posts/:id/share')
  revokeShare(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.shares.revoke(user.id, id);
  }

  @Get('storage')
  async storageUsage(@CurrentUser() user: AuthUser) {
    const [used, limitMb] = await Promise.all([this.usedBytes(user.id), this.storageLimitMb(user.id)]);
    // 1MB 미만을 0 으로 보여 주면 "안 썼는데 왜 안 올라가지" 가 됩니다. 소수점 한 자리까지
    return { usedMb: Math.round((used / 1024 / 1024) * 10) / 10, limitMb };
  }

  // ── 아래는 내부용 ────────────────────────────────────

  private async postById(postId: string, viewerId: string) {
    const rows = await this.feed({ id: viewerId, sessionId: '' });
    return rows.find((p) => p.id === postId) ?? null;
  }

  /** 게시물에 붙은 파일들의 "볼 수 있는 주소"를 만들어 붙입니다 */
  private async withMedia(
    row: {
      id: string;
      groupId: string;
      groupName: string;
      placeName: string | null;
      placeAddress: string | null;
      latitude: number | null;
      longitude: number | null;
      emergencyTitle: string | null;
      emergencyMessage: string | null;
      createdAt: Date;
      authorId: string;
      nickname: string;
      avatarUrl: string | null;
    },
    viewerId: string,
  ) {
    const assets = await this.db
      .selectFrom('media.post_assets as pa')
      .innerJoin('media.assets as a', 'a.id', 'pa.asset_id')
      .select(['a.id', 'a.object_key', 'a.kind', 'a.width', 'a.height', 'a.duration_sec as durationSec'])
      .where('pa.post_id', '=', row.id)
      .orderBy('pa.position')
      .execute();

    const media = await Promise.all(
      assets.map(async (a) => ({
        id: a.id,
        type: a.kind,
        uri: (await this.storage.viewUrl(a.object_key)) ?? '',
        width: a.width,
        height: a.height,
        durationSec: a.durationSec,
      })),
    );

    // 1:1 방은 이름이 비어 있으므로 상대방 이름으로 바꿔 줍니다 (groups API 와 같은 규칙)
    const members = await this.db
      .selectFrom('social.group_members as gm')
      .innerJoin('member.users as u', 'u.id', 'gm.user_id')
      .select(['u.id', 'u.nickname'])
      .where('gm.group_id', '=', row.groupId)
      .execute();

    return {
      id: row.id,
      groupId: row.groupId,
      groupName: displayGroupName({ name: row.groupName, members, viewerId }),
      author: { id: row.authorId, nickname: row.nickname, avatarUrl: row.avatarUrl },
      media,
      place: row.placeAddress
        ? { placeName: row.placeName ?? undefined, address: row.placeAddress, latitude: row.latitude!, longitude: row.longitude! }
        : undefined,
      emergencyNotice: row.emergencyTitle ? { title: row.emergencyTitle, message: row.emergencyMessage ?? '' } : undefined,
      createdAt: row.createdAt,
    };
  }

  /**
   * 주소만 받고 1시간 넘게 안 올린 기록을 지웁니다.
   * 업로드 주소가 10분이면 만료되므로, 1시간이 지났으면 올릴 일이 없습니다.
   * 따로 배치를 돌리지 않고 다음 업로드 때 같이 치웁니다.
   */
  private async dropStalePending(userId: string) {
    const rows = await this.db
      .deleteFrom('media.assets')
      .where('owner_id', '=', userId)
      .where('uploaded_at', 'is', null)
      .where('created_at', '<', new Date(Date.now() - 60 * 60_000))
      .returning('object_key')
      .execute();
    // 혹시 파일만 올라가고 게시물이 안 만들어진 경우까지 지웁니다
    for (const row of rows) await this.storage.remove(row.object_key).catch(() => undefined);
  }

  /** 실제로 올라온 것만 셉니다. 주소만 받고 안 올린 것은 용량에 넣지 않습니다 */
  private async usedBytes(userId: string): Promise<number> {
    const row = await this.db
      .selectFrom('media.assets')
      .select(({ fn }) => fn.sum<string>('bytes').as('total'))
      .where('owner_id', '=', userId)
      .where('uploaded_at', 'is not', null)
      // SOS 녹음은 사진 용량에 넣지 않습니다
      .where('kind', '!=', 'audio')
      .executeTakeFirst();
    return Number(row?.total ?? 0);
  }

  /** 등급 정책 + 사용자별 예외 (관리자 화면에서 바꿉니다) */
  private async storageLimitMb(userId: string): Promise<number> {
    return policyNumber(await resolvePolicy(this.db, userId), 'photoStorageMb', 0);
  }

  private async assertGroupMember(userId: string, groupId: string) {
    const row = await this.db
      .selectFrom('social.group_members')
      .select('user_id')
      .where('group_id', '=', groupId)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    if (!row) throw appError(403, 'NOT_GROUP_MEMBER', '이 그룹의 멤버가 아닙니다');
  }
}

/**
 * 공유 링크로 사진 보기 (WBS 6).
 *
 * **로그인 없이 열립니다** — 그룹 밖 사람에게 보여 주는 주소라서 그렇습니다.
 * 그래서 가드를 걸지 않은 별도 컨트롤러로 둡니다. 실수로 다른 API 에 가드가 빠지는 일을
 * 막으려면, 가드 없는 경로가 한곳에 모여 있어야 합니다.
 */
@Controller('shared')
class SharedPostController {
  constructor(private readonly shares: PostShareService) {}

  @Get(':token')
  view(@Param('token') token: string) {
    return this.shares.view(token);
  }
}

@Module({
  controllers: [GalleryController, SharedPostController],
  providers: [StorageService, PostShareService],
  exports: [StorageService],
})
export class MediaModule {}
