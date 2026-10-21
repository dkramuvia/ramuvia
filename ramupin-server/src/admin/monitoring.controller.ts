import { Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { AnomalyService } from '../anomaly/anomaly.service.js';
import { parseInput } from '../common/app-error.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { LocationService } from '../location/location.service.js';
import { SOS_PLACE_COLUMNS, withSosPlace } from '../sos/sos-place.js';
import { AdminGuard, assertCanEdit, CurrentAdmin, type AdminUser } from './admin.guard.js';

/**
 * 모니터링 사이트 (docs/anomaly-alerts.md).
 *
 * 1인단독 사용자는 친구에게 알림이 가지 않고 **여기에만** 뜹니다.
 * 목록에 뜬 건은 회사가 직접 전화합니다. 확인콜·출동 기록은 만들지 않습니다 (09-17 대표 확정).
 *
 * 앱 로그인이 아니라 관리자 로그인으로 막습니다. 남의 실시간 위치가 보이는 화면이라,
 * 앱 사용자 아무나 볼 수 있으면 안 됩니다.
 */
@Controller('admin/api/monitoring')
@UseGuards(AdminGuard)
export class MonitoringController {
  constructor(
    private readonly anomaly: AnomalyService,
    @Inject(MAIN_DB) private readonly db: MainDb,
    private readonly location: LocationService,
  ) {}

  /**
   * 회사가 받은 SOS (WBS 9.3).
   * 지정 수신인이 없는 분이 SOS 를 누르면 여기로만 옵니다 — 놓치면 안 됩니다.
   */
  @Get('sos')
  async sosList(@CurrentAdmin() admin: AdminUser, @Query('limit') limitRaw?: string) {
    const limit = Math.min(Number(limitRaw) || 100, 300);
    const rows = await this.db
      .selectFrom('member.sos_events as e')
      .innerJoin('member.users as u', 'u.id', 'e.user_id')
      .select([
        'e.id',
        'e.user_id as userId',
        'u.nickname',
        'u.public_id as publicId',
        'u.single_household as singleHousehold',
        // 장소는 암호화돼 있어 서버에서 풀어 보냅니다 (관리자 화면이 받는 모양은 그대로)
        ...SOS_PLACE_COLUMNS,
        'e.status',
        'e.recipient_count as recipientCount',
        'e.to_monitoring as toMonitoring',
        'e.started_at as startedAt',
        'e.created_at as createdAt',
        'e.acknowledged_at as acknowledgedAt',
      ])
      .where('e.status', '=', 'sent')
      .orderBy('e.created_at', 'desc')
      .limit(limit)
      .execute();
    // 관제센터 직원이 SOS 위치를 본 기록 (위치정보 이용·제공사실 확인자료)
    await this.location.logAdminView([...new Set(rows.map((r) => r.userId))], admin.id, 'monitoring');
    return rows.map(withSosPlace);
  }

  /** SOS 를 사람이 확인했다고 표시 */
  @Post('sos/:id/acknowledge')
  async acknowledgeSos(@CurrentAdmin() admin: AdminUser, @Param('id', ParseUUIDPipe) id: string) {
    assertCanEdit(admin);
    await this.db
      .updateTable('member.sos_events')
      .set({ acknowledged_at: new Date() })
      .where('id', '=', id)
      .execute();
    return { ok: true };
  }

  /** 아직 안 풀린 이상징후 (최근 순) */
  @Get('anomalies')
  async list(@Query('limit') limitRaw?: string) {
    const limit = Math.min(Number(limitRaw) || 100, 300);
    return this.anomaly.openEvents(limit);
  }

  /** 한 사람의 지금 상태 + 지난 기록. 전화를 걸지 판단할 때 봅니다 */
  @Get('users/:publicId')
  async user(@CurrentAdmin() admin: AdminUser, @Param('publicId') publicIdRaw: string) {
    const publicId = parseInput(z.string().regex(/^\d{8}$/, '8자리 사용자 ID'), publicIdRaw);
    const detail = await this.anomaly.userDetail(publicId);
    if (!detail) throw new NotFoundException('없는 사용자입니다');
    // 마지막 위치를 보여 주므로 관제센터 열람으로 남깁니다 (위치정보 이용·제공사실 확인자료)
    if (detail.status) await this.location.logAdminView([detail.user.id], admin.id, 'monitoring');
    return detail;
  }

  /** 사람이 보고 "확인함"을 눌렀을 때. 기록은 남고 목록에서 표시만 바뀝니다 */
  @Post('anomalies/:id/acknowledge')
  async acknowledge(@CurrentAdmin() admin: AdminUser, @Param('id', ParseUUIDPipe) id: string) {
    assertCanEdit(admin);
    await this.anomaly.acknowledge(id);
    return { ok: true };
  }
}
