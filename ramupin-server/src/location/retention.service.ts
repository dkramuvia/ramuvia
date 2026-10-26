import { Inject, Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { sql } from 'kysely';

import { env } from '../config/env.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { LOCATION_DB, type LocationDb } from './location.service.js';

/**
 * 위치 이력 보관·파기 배치 (WBS 4.3, 위치정보법).
 *
 * 하는 일 세 가지
 *   1. **다음 달 파티션을 미리 만듭니다.** 없으면 달이 바뀌는 순간 위치 저장이 통째로 실패합니다
 *   2. **보관 기간이 지난 달을 통째로 버립니다.** 행을 하나씩 지우지 않고 파티션을 DROP 하므로
 *      몇 억 건이어도 순식간이고 DB 에 부담이 없습니다 (모든 사람 공통 상한, LOCATION_KEEP_MONTHS)
 *   3. **등급별 보관 일수가 지난 기록을 사람별로 지웁니다** (locationRetentionDays, 10-26 대표님:
 *      베이직 7일 · 플래티넘 15일 · 트리니티 30일). LOCATION_PLAN_RETENTION=true 일 때만
 *
 * **파기하지 않는 것**
 *   - `location_access_logs` (위치정보 이용·제공 사실 확인자료). 위치정보법상 **보관 의무**가
 *     있는 자료라, 위치 이력과 같은 기준으로 지우면 안 됩니다. 별도 확인 후 다룹니다
 *   - `user_status` — 사용자별 한 줄이라 양이 문제되지 않고, 이상징후 판정에 계속 씁니다
 */

/** 배치 주기. 하루 한 번이면 충분합니다 (파티션은 월 단위) */
const INTERVAL_MS = 24 * 60 * 60_000;
/** 서버가 뜨자마자 한 번 돌리되, 시작 부하와 겹치지 않게 조금 미룹니다 */
const FIRST_RUN_DELAY_MS = 60_000;
/** 사람별로 지울 때 한 번에 묶는 인원. 한 문장이 너무 오래 잠그지 않게 나눕니다 */
const USER_BATCH = 500;

@Injectable()
export class RetentionService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RetentionService.name);
  private timer: NodeJS.Timeout | null = null;
  private firstRun: NodeJS.Timeout | null = null;

  constructor(
    @Inject(LOCATION_DB) private readonly db: LocationDb,
    @Inject(MAIN_DB) private readonly mainDb: MainDb,
  ) {}

  onModuleInit() {
    this.firstRun = setTimeout(() => void this.run(), FIRST_RUN_DELAY_MS);
    this.timer = setInterval(() => void this.run(), INTERVAL_MS);
    const keep = env.LOCATION_KEEP_MONTHS;
    this.logger.log(keep > 0 ? `위치 보관 배치 시작 (보관 ${keep}개월)` : '위치 보관 배치 시작 (파기 꺼짐, 파티션만 준비)');
    this.logger.log(env.LOCATION_PLAN_RETENTION ? '등급별 위치 보관 켜짐 (locationRetentionDays)' : '등급별 위치 보관 꺼짐');
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
    if (this.firstRun) clearTimeout(this.firstRun);
  }

  /** 한 바퀴. 배치와 테스트에서 부릅니다 */
  async run(): Promise<{ dropped: number; deleted: number }> {
    try {
      await this.ensurePartitions();
      const dropped = await this.dropExpired();
      const deleted = env.LOCATION_PLAN_RETENTION ? await this.deleteByPlan() : 0;
      return { dropped, deleted };
    } catch (error) {
      // 하루에 한 번이라 다음 차례까지 시간이 있습니다. 죽지 않고 로그만 남깁니다
      this.logger.error(`위치 보관 배치 실패: ${String(error)}`);
      return { dropped: 0, deleted: 0 };
    }
  }

  /**
   * 등급별 보관 일수(locationRetentionDays)가 지난 이동 경로와 머문 곳을 지웁니다.
   *
   * 등급 정책 위에 사람별 예외를 덮은 값을 씁니다. 값이 없는 사람은 **지우지 않습니다**
   * (모르는 기준으로 지우는 쪽이 더 위험합니다). 등급을 내리면 그 다음 날 짧은 기준으로 지워집니다.
   *
   * 지우지 않는 것: 이용·제공 사실 확인자료(location_access_logs), SOS 기록·안심존 드나든 기록(본 DB)
   */
  async deleteByPlan(): Promise<number> {
    const rows = await sql<{ id: string; days: number }>`
      SELECT u.id,
             COALESCE((o.policy ->> 'locationRetentionDays')::int, (p.policy ->> 'locationRetentionDays')::int) AS days
      FROM member.users u
      JOIN config.plan_policies p ON p.plan = u.plan
      LEFT JOIN config.user_policy_overrides o ON o.user_id = u.id
      WHERE COALESCE(o.policy ? 'locationRetentionDays', false) OR p.policy ? 'locationRetentionDays'
    `.execute(this.mainDb);

    // 같은 일수끼리 묶어 한 문장으로 지웁니다
    const byDays = new Map<number, string[]>();
    for (const row of rows.rows) {
      if (!Number.isInteger(row.days) || row.days < 1) continue;
      byDays.set(row.days, [...(byDays.get(row.days) ?? []), row.id]);
    }

    let deleted = 0;
    for (const [days, ids] of byDays) {
      for (let i = 0; i < ids.length; i += USER_BATCH) {
        const batch = ids.slice(i, i + USER_BATCH);
        const points = await sql`
          DELETE FROM location.location_points
          WHERE user_id = ANY(${batch}::uuid[])
            AND measured_at < now() - make_interval(days => ${days})
        `.execute(this.db);
        // 아직 머무는 중(left_at 없음)인 곳은 지금 위치라 남깁니다
        const stays = await sql`
          DELETE FROM location.stays
          WHERE user_id = ANY(${batch}::uuid[])
            AND left_at IS NOT NULL
            AND left_at < now() - make_interval(days => ${days})
        `.execute(this.db);
        deleted += Number(points.numAffectedRows ?? 0) + Number(stays.numAffectedRows ?? 0);
      }
    }
    if (deleted > 0) this.logger.warn(`등급별 보관 기간이 지난 위치 ${deleted}건을 지웠습니다`);
    return deleted;
  }

  /**
   * 이번 달과 다음 달 파티션을 준비합니다.
   * 다음 달 것을 미리 만드는 이유: 달이 바뀌는 자정에 만들면, 그 순간 들어온 위치가 저장에 실패합니다.
   */
  private async ensurePartitions(): Promise<void> {
    await sql`
      SELECT location.ensure_month_partition(now()::date),
             location.ensure_month_partition((now() + interval '1 month')::date)
    `.execute(this.db);
  }

  /**
   * 보관 기간이 지난 달을 버립니다.
   *
   * 되돌릴 수 없는 작업이라, 무엇을 버릴지 **먼저 확인하고 로그로 남긴 뒤** 실행합니다.
   * 0개월로 두면(개발 PC 기본값) 아무것도 지우지 않습니다.
   */
  private async dropExpired(): Promise<number> {
    const keep = env.LOCATION_KEEP_MONTHS;
    if (keep <= 0) return 0;

    const targets = await this.expiredPartitions(keep);
    if (targets.length === 0) return 0;

    // 지우기 전에 무엇을 지우는지 남깁니다. 나중에 "왜 없어졌나" 를 추적할 수 있어야 합니다
    this.logger.warn(`보관 기간(${keep}개월)이 지난 위치를 파기합니다: ${targets.join(', ')}`);

    const result = await sql<{ dropped: number }>`SELECT location.drop_expired_partitions(${keep}) AS dropped`.execute(this.db);
    const dropped = Number(result.rows[0]?.dropped ?? 0);
    this.logger.warn(`위치 파기 완료: ${dropped}개월분`);
    return dropped;
  }

  /** 이번에 버려질 파티션 이름. 미리 확인하고 로그로 남기기 위한 것입니다 */
  async expiredPartitions(keepMonths = env.LOCATION_KEEP_MONTHS): Promise<string[]> {
    if (keepMonths <= 0) return [];
    const result = await sql<{ name: string }>`
      SELECT c.relname AS name
      FROM pg_inherits i
      JOIN pg_class c ON c.oid = i.inhrelid
      JOIN pg_class p ON p.oid = i.inhparent
      JOIN pg_namespace n ON n.oid = p.relnamespace
      WHERE n.nspname = 'location'
        AND p.relname = 'location_points'
        AND to_date(right(c.relname, 6), 'YYYYMM')
            < (date_trunc('month', now()) - make_interval(months => ${keepMonths}))::date
      ORDER BY c.relname
    `.execute(this.db);
    return result.rows.map((r) => r.name);
  }
}
