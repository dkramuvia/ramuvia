import { Inject, Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { sql } from 'kysely';

import { env } from '../config/env.js';
import { LOCATION_DB, type LocationDb } from './location.service.js';

/**
 * 위치 이력 보관·파기 배치 (WBS 4.3, 위치정보법).
 *
 * 하는 일 두 가지
 *   1. **다음 달 파티션을 미리 만듭니다.** 없으면 달이 바뀌는 순간 위치 저장이 통째로 실패합니다
 *   2. **보관 기간이 지난 달을 통째로 버립니다.** 행을 하나씩 지우지 않고 파티션을 DROP 하므로
 *      몇 억 건이어도 순식간이고 DB 에 부담이 없습니다
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

@Injectable()
export class RetentionService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RetentionService.name);
  private timer: NodeJS.Timeout | null = null;
  private firstRun: NodeJS.Timeout | null = null;

  constructor(@Inject(LOCATION_DB) private readonly db: LocationDb) {}

  onModuleInit() {
    this.firstRun = setTimeout(() => void this.run(), FIRST_RUN_DELAY_MS);
    this.timer = setInterval(() => void this.run(), INTERVAL_MS);
    const keep = env.LOCATION_KEEP_MONTHS;
    this.logger.log(keep > 0 ? `위치 보관 배치 시작 (보관 ${keep}개월)` : '위치 보관 배치 시작 (파기 꺼짐, 파티션만 준비)');
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
    if (this.firstRun) clearTimeout(this.firstRun);
  }

  /** 한 바퀴. 배치와 테스트에서 부릅니다 */
  async run(): Promise<{ dropped: number }> {
    try {
      await this.ensurePartitions();
      return { dropped: await this.dropExpired() };
    } catch (error) {
      // 하루에 한 번이라 다음 차례까지 시간이 있습니다. 죽지 않고 로그만 남깁니다
      this.logger.error(`위치 보관 배치 실패: ${String(error)}`);
      return { dropped: 0 };
    }
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
