import { Controller, Get, Inject, NotFoundException, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { parseInput } from '../common/app-error.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { LocationService } from '../location/location.service.js';
import { AdminGuard } from './admin.guard.js';

/**
 * 법정 기록 조회 (위치정보사업 신고 [첨부 2]).
 *  - 관리자 접근기록: 관제센터에 누가 언제 어디서 들어왔는지
 *  - 위치정보 이용·제공사실 확인자료: 대상 · 취득경로 · 제공서비스 · 제공받는자 · 이용일시
 *  - 위치정보 수집 기록: 위치를 전송받을 때마다
 *
 * 보기만 합니다. 기록은 DB 권한으로 고치거나 지울 수 없게 막혀 있습니다 (migrations main/0038, location/0008).
 */
const listQuery = z.object({
  // 8자리 사용자 ID 로 대상 한 사람만
  q: z
    .string()
    .regex(/^\d{8}$/, '8자리 사용자 ID')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  before: z.string().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

@Controller('admin/api')
@UseGuards(AdminGuard)
export class LogsController {
  constructor(
    @Inject(MAIN_DB) private readonly db: MainDb,
    private readonly location: LocationService,
  ) {}

  /** 관리자 접근기록 (최근 순) */
  @Get('access-logs')
  async accessLogs(@Query() query: unknown) {
    const { before, limit } = parseInput(listQuery, query);
    let q = this.db
      .selectFrom('config.admin_access_logs as l')
      .leftJoin('config.admin_users as u', 'u.id', 'l.admin_id')
      .select(['l.id', 'l.login_id as loginId', 'u.name', 'l.action', 'l.ip', 'l.user_agent as userAgent', 'l.created_at as createdAt'])
      .orderBy('l.id', 'desc')
      .limit(limit);
    if (before) q = q.where('l.id', '<', before);
    return q.execute();
  }

  /** 위치정보 이용·제공사실 확인자료 */
  @Get('location-logs')
  async locationLogs(@Query() query: unknown) {
    const { q, before, limit } = parseInput(listQuery, query);
    const subjectUserId = q ? await this.userIdOf(q) : undefined;
    const rows = await this.location.listAccessLogs({ subjectUserId, before, limit });

    const users = await this.publicIds(rows.flatMap((r) => [r.subject_user_id, r.viewer_user_id]));
    const admins = await this.adminNames(rows.map((r) => r.viewer_admin_id));
    return rows.map((r) => ({
      id: r.id,
      subject: users.get(r.subject_user_id) ?? null,
      source: r.source,
      purpose: r.purpose,
      // 본인이 자기 위치를 본 것은 제3자 제공이 아니라 비워 둡니다
      recipient: r.viewer_admin_id
        ? { kind: 'admin' as const, name: admins.get(r.viewer_admin_id) ?? null }
        : r.viewer_user_id && r.viewer_user_id !== r.subject_user_id
          ? { kind: 'user' as const, ...(users.get(r.viewer_user_id) ?? { publicId: null, nickname: null }) }
          : null,
      accessedAt: r.accessed_at,
    }));
  }

  /** 위치정보 수집 기록 (앱이 위치를 보낼 때마다, 묶음 단위) */
  @Get('location-collections')
  async collections(@Query() query: unknown) {
    const { q, before, limit } = parseInput(listQuery, query);
    const userId = q ? await this.userIdOf(q) : undefined;
    const beforeAt = before ? new Date(before) : undefined;
    const rows = await this.location.listCollections({ userId, before: beforeAt && !Number.isNaN(beforeAt.getTime()) ? beforeAt : undefined, limit });
    const users = await this.publicIds(rows.map((r) => r.userId));
    return rows.map((r) => ({ subject: users.get(r.userId) ?? null, source: r.source, points: r.points, receivedAt: r.receivedAt }));
  }

  private async userIdOf(publicId: string): Promise<string> {
    const row = await this.db.selectFrom('member.users').select('id').where('public_id', '=', publicId).executeTakeFirst();
    if (!row) throw new NotFoundException('없는 사용자입니다');
    return row.id;
  }

  /** 내부 id → 8자리 ID·닉네임. 탈퇴해 지워진 사용자는 빠집니다 (화면에 "탈퇴한 사용자") */
  private async publicIds(ids: (string | null)[]) {
    const unique = [...new Set(ids.filter((id): id is string => !!id))];
    const map = new Map<string, { publicId: string; nickname: string }>();
    if (unique.length === 0) return map;
    const rows = await this.db.selectFrom('member.users').select(['id', 'public_id', 'nickname']).where('id', 'in', unique).execute();
    for (const r of rows) map.set(r.id, { publicId: r.public_id, nickname: r.nickname });
    return map;
  }

  private async adminNames(ids: (string | null)[]) {
    const unique = [...new Set(ids.filter((id): id is string => !!id))];
    const map = new Map<string, string>();
    if (unique.length === 0) return map;
    const rows = await this.db.selectFrom('config.admin_users').select(['id', 'name', 'login_id']).where('id', 'in', unique).execute();
    for (const r of rows) map.set(r.id, `${r.name} (${r.login_id})`);
    return map;
  }
}
