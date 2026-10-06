import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { sql } from 'kysely';

import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { AdminGuard } from './admin.guard.js';

/**
 * 관제센터 **01 종합 모니터링** (피그마 `관리자` 파일, 2026-10-06).
 *
 * 국가·등급 단위 **집계만** 내려보냅니다. 개인별 결제 내역이나 위치는 들어가지
 * 않습니다 — 이 화면은 "얼마나 쓰고 있나"를 보는 곳이고, 개인을 보는 곳은
 * 02·03 사용자별 설정입니다.
 *
 * **다운로드 수는 여기서 못 냅니다.** 스토어가 가진 숫자라 Google Play Developer API
 * 와 App Store Connect API 를 붙여야 하고, 앱이 출시되기 전에는 값 자체가 없습니다.
 * 그래서 자리만 `null` 로 비워 두고 출시 뒤에 채웁니다 (화면은 '-' 로 보여 줍니다).
 */

/** 활성 사용자(MAU) 기준: 최근 30일 안에 앱을 쓴 사람. 스토어 통계와 맞추기 쉬운 기준입니다 */
const ACTIVE_DAYS = 30;

/** 표·차트에 이름을 그대로 보여 줄 국가 수. 나머지는 '기타' 한 줄로 묶습니다 */
const TOP_COUNTRIES = 8;

/** 유료 결제 등급 (피그마 01 화면 각주: 유료 = 플래티넘 + 트리니티) */
const PAID_PLANS = ['platinum', 'trinity'];

const PLAN_ORDER = ['basic', 'platinum', 'trinity', 'care', 'guardian'] as const;
const PLAN_LABEL: Record<string, string> = {
  basic: '베이직',
  platinum: '플래티넘',
  trinity: '트리니티',
  care: '케어',
  guardian: '가디언',
};

interface CountryRow {
  country: string;
  signUps: number;
  activeUsers: number;
  paidUsers: number;
  freeUsers: number;
  singleHousehold: number;
  senior: number;
}

@Controller('admin/api/overview')
@UseGuards(AdminGuard)
export class OverviewController {
  constructor(@Inject(MAIN_DB) private readonly db: MainDb) {}

  @Get()
  async overview() {
    const since = new Date(Date.now() - ACTIVE_DAYS * 24 * 60 * 60 * 1000);

    const [countries, plans] = await Promise.all([this.byCountry(since), this.byPlan(since)]);

    const 합계 = countries.reduce<CountryRow>(
      (a, c) => ({
        country: '',
        signUps: a.signUps + c.signUps,
        activeUsers: a.activeUsers + c.activeUsers,
        paidUsers: a.paidUsers + c.paidUsers,
        freeUsers: a.freeUsers + c.freeUsers,
        singleHousehold: a.singleHousehold + c.singleHousehold,
        senior: a.senior + c.senior,
      }),
      { country: '', signUps: 0, activeUsers: 0, paidUsers: 0, freeUsers: 0, singleHousehold: 0, senior: 0 },
    );

    return {
      /** 이 숫자를 언제 기준으로 냈는지. 화면 오른쪽 위에 그대로 보여 줍니다 */
      asOf: new Date().toISOString(),
      activeDays: ACTIVE_DAYS,
      totals: {
        signUps: 합계.signUps,
        activeUsers: 합계.activeUsers,
        /** 가입자 대비 활성 비율. **다운로드 대비가 아닙니다** — 아래 downloads 참고 */
        activeRate: 비율(합계.activeUsers, 합계.signUps),
        paidUsers: 합계.paidUsers,
        /**
         * 스토어에서 가져와야 하는 값. 출시 전에는 전부 null 입니다.
         * 피그마의 'KPI 카드 4개' 중 '전체 다운로드'와 '다운로드 대비 활성화율'이 여기에 걸려 있습니다
         */
        downloads: { android: null, ios: null, total: null },
      },
      countries: this.기타로묶기(countries),
      plans,
    };
  }

  /** 국가별 한 줄씩. 가입자 많은 순 */
  private async byCountry(since: Date): Promise<CountryRow[]> {
    const rows = await this.db
      .selectFrom('member.users')
      .where('status', '=', 'active')
      .select(({ fn, eb }) => [
        'country',
        fn.countAll<string>().as('signUps'),
        eb.fn.count<string>(sql`CASE WHEN last_active_at >= ${since} THEN 1 END`).as('activeUsers'),
        eb.fn.count<string>(sql`CASE WHEN plan = ANY(${PAID_PLANS}) THEN 1 END`).as('paidUsers'),
        eb.fn.count<string>(sql`CASE WHEN plan = 'basic' THEN 1 END`).as('freeUsers'),
        eb.fn.count<string>(sql`CASE WHEN plan = 'guardian' THEN 1 END`).as('singleHousehold'),
        eb.fn.count<string>(sql`CASE WHEN plan = 'care' THEN 1 END`).as('senior'),
      ])
      .groupBy('country')
      .orderBy('signUps', 'desc')
      .execute();

    return rows.map((r) => ({
      country: r.country,
      signUps: Number(r.signUps),
      activeUsers: Number(r.activeUsers),
      paidUsers: Number(r.paidUsers),
      freeUsers: Number(r.freeUsers),
      singleHousehold: Number(r.singleHousehold),
      senior: Number(r.senior),
    }));
  }

  /** 결제 등급별 사용자 수 + 비중. 등급 순서는 화면과 같게 고정합니다 */
  private async byPlan(since: Date) {
    const rows = await this.db
      .selectFrom('member.users')
      .where('status', '=', 'active')
      .where('last_active_at', '>=', since)
      .select(({ fn }) => ['plan', fn.countAll<string>().as('users')])
      .groupBy('plan')
      .execute();

    const 수 = new Map(rows.map((r) => [r.plan, Number(r.users)]));
    const 총 = [...수.values()].reduce((a, b) => a + b, 0);

    return PLAN_ORDER.map((plan) => ({
      plan,
      label: PLAN_LABEL[plan],
      users: 수.get(plan) ?? 0,
      share: 비율(수.get(plan) ?? 0, 총),
    }));
  }

  /**
   * 상위 몇 나라만 이름을 두고 나머지는 '기타' 한 줄로 묶습니다.
   * 50개국이 한 줄씩 나오면 표도 차트도 읽을 수 없습니다 (피그마도 '기타(50개국)' 로 그려져 있습니다).
   */
  private 기타로묶기(rows: CountryRow[]) {
    if (rows.length <= TOP_COUNTRIES + 1) return rows.map(활성화율붙이기);

    const 상위 = rows.slice(0, TOP_COUNTRIES);
    const 나머지 = rows.slice(TOP_COUNTRIES);
    const 기타: CountryRow & { countries: number } = {
      country: 'ZZ',
      countries: 나머지.length,
      signUps: 0,
      activeUsers: 0,
      paidUsers: 0,
      freeUsers: 0,
      singleHousehold: 0,
      senior: 0,
    };
    for (const r of 나머지) {
      기타.signUps += r.signUps;
      기타.activeUsers += r.activeUsers;
      기타.paidUsers += r.paidUsers;
      기타.freeUsers += r.freeUsers;
      기타.singleHousehold += r.singleHousehold;
      기타.senior += r.senior;
    }
    return [...상위.map(활성화율붙이기), 활성화율붙이기(기타)];
  }
}

/** 소수 첫째 자리까지. 분모가 0 이면 null — 화면에서 '-' 로 보여 줍니다 */
function 비율(위: number, 아래: number): number | null {
  if (아래 <= 0) return null;
  return Math.round((위 / 아래) * 1000) / 10;
}

function 활성화율붙이기<T extends CountryRow>(r: T) {
  return { ...r, activeRate: 비율(r.activeUsers, r.signUps), downloads: null };
}
