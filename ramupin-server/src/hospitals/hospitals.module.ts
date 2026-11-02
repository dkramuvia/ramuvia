import { Controller, Get, Inject, Injectable, Logger, Module, Query, UseGuards, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { sql } from 'kysely';
import type { Redis } from 'ioredis';
import { z } from 'zod';

import { AuthGuard } from '../auth/auth.guard.js';
import { parseInput } from '../common/app-error.js';
import { env } from '../config/env.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { REDIS } from '../redis/redis.module.js';

/**
 * 지도 위 병원 (11-02 대표님 확정: 전국 모든 병원을 이름과 함께, 10km 제한 없이).
 *
 * 공공 API(심평원 병원정보서비스 v2)는 개발계정 하루 1,000건이라 앱이 지도를 움직일 때마다 부를 수 없습니다.
 * 그래서 서버가 일주일마다 전국 목록(약 8만 곳, 1,000곳씩 80번)을 통째로 받아 config.hospitals 에 두고,
 * 앱은 지금 보이는 영역만 우리 서버에 묻습니다.
 *
 * 넓게 축소하면 서울 10km 안에만 1만 곳이 넘어 이름이 겹쳐 지도를 덮습니다.
 * 영역 안이 많으면 격자로 묶어 "120곳" 만 돌려주고, 확대하면 병원 하나하나를 돌려줍니다.
 */

const API = 'https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList';
const PAGE_SIZE = 1000;
const TIMEOUT_MS = 30_000;
/** 이보다 오래됐으면 다시 받습니다 */
const RESYNC_AFTER_MS = 7 * 24 * 60 * 60_000;
/** 다시 받을 때가 됐는지 이 간격으로 봅니다 */
const CHECK_INTERVAL_MS = 6 * 60 * 60_000;
/** 서버가 여러 대여도 한 대만 받게 */
const LOCK_KEY = 'hospitals:sync-lock';
const LOCK_SEC = 60 * 60;

/** 영역 안 병원이 이보다 많으면 묶어서 돌려줍니다 */
const MAX_ITEMS = 150;
/** 묶음 격자 (세로 × 가로). 폰 화면이 세로로 길어 세로를 더 잘게 */
const GRID_ROWS = 8;
const GRID_COLS = 5;

interface ApiItem {
  ykiho?: string;
  yadmNm?: string;
  clCd?: string | number;
  clCdNm?: string;
  addr?: string;
  telno?: string;
  XPos?: string | number;
  YPos?: string | number;
}

@Injectable()
export class HospitalsService {
  private readonly logger = new Logger(HospitalsService.name);

  constructor(
    @Inject(MAIN_DB) private readonly db: MainDb,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** 마지막으로 받은 지 일주일이 넘었으면 다시 받습니다 */
  async syncIfStale(now = new Date()): Promise<void> {
    if (!env.HOSPITAL_API_KEY) return;
    const row = await this.db.selectFrom('config.hospitals').select((eb) => eb.fn.max('synced_at').as('last')).executeTakeFirst();
    const last = row?.last ? new Date(row.last).getTime() : 0;
    if (now.getTime() - last < RESYNC_AFTER_MS) return;
    const locked = await this.redis.set(LOCK_KEY, '1', 'EX', LOCK_SEC, 'NX');
    if (!locked) return;
    try {
      await this.sync(now);
    } finally {
      await this.redis.del(LOCK_KEY);
    }
  }

  /**
   * 전국 목록을 받아 갈아 끼웁니다.
   * 도중에 한 쪽이라도 못 받으면 지우지 않고 끝냅니다 — 받은 만큼만 남기면 병원이 사라져 보입니다
   */
  async sync(startedAt = new Date()): Promise<{ saved: number; removed: number }> {
    let saved = 0;
    let total = Infinity;
    for (let page = 1; (page - 1) * PAGE_SIZE < total; page++) {
      const body = await this.fetchPage(page);
      total = body.totalCount;
      const rows = body.items.flatMap((item) => toRow(item, startedAt));
      if (rows.length > 0) {
        await this.db
          .insertInto('config.hospitals')
          .values(rows)
          .onConflict((oc) =>
            oc.column('ykiho').doUpdateSet((eb) => ({
              name: eb.ref('excluded.name'),
              kind_code: eb.ref('excluded.kind_code'),
              kind_name: eb.ref('excluded.kind_name'),
              address: eb.ref('excluded.address'),
              phone: eb.ref('excluded.phone'),
              latitude: eb.ref('excluded.latitude'),
              longitude: eb.ref('excluded.longitude'),
              synced_at: eb.ref('excluded.synced_at'),
            })),
          )
          .execute();
      }
      saved += rows.length;
    }
    // 이번에 안 온 곳은 폐업 등으로 빠진 병원입니다
    const removed = await this.db.deleteFrom('config.hospitals').where('synced_at', '<', startedAt).executeTakeFirst();
    const removedCount = Number(removed.numDeletedRows ?? 0);
    this.logger.log(`병원 목록 갱신: ${saved}곳 저장, ${removedCount}곳 삭제`);
    return { saved, removed: removedCount };
  }

  private async fetchPage(page: number): Promise<{ totalCount: number; items: ApiItem[] }> {
    const url = new URL(API);
    url.searchParams.set('ServiceKey', env.HOSPITAL_API_KEY);
    url.searchParams.set('pageNo', String(page));
    url.searchParams.set('numOfRows', String(PAGE_SIZE));
    url.searchParams.set('_type', 'json');
    let lastError: unknown;
    // 공공 API 는 가끔 느리거나 끊깁니다. 세 번까지 다시 시도합니다
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        const text = await response.text();
        const data = JSON.parse(text) as {
          response?: { header?: { resultCode?: string; resultMsg?: string }; body?: { totalCount?: number; items?: { item?: ApiItem | ApiItem[] } | '' } };
        };
        const header = data.response?.header;
        if (header?.resultCode !== '00') throw new Error(`결과 ${header?.resultCode} ${header?.resultMsg}`);
        const body = data.response?.body;
        const item = body?.items ? body.items.item : undefined;
        return { totalCount: Number(body?.totalCount ?? 0), items: item ? (Array.isArray(item) ? item : [item]) : [] };
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error(`병원 목록 ${page}쪽을 받지 못했습니다: ${String(lastError)}`);
  }

  /** 지도에 보이는 영역의 병원. 많으면 격자로 묶어 개수만 */
  async inArea(area: { south: number; west: number; north: number; east: number }) {
    const inBox = this.db
      .selectFrom('config.hospitals')
      .where('latitude', '>=', area.south)
      .where('latitude', '<=', area.north)
      .where('longitude', '>=', area.west)
      .where('longitude', '<=', area.east);

    const items = await inBox
      .select(['ykiho', 'name', 'kind_name', 'address', 'phone', 'latitude', 'longitude'])
      .limit(MAX_ITEMS + 1)
      .execute();
    if (items.length <= MAX_ITEMS) {
      return {
        hospitals: items.map((h) => ({
          id: h.ykiho,
          name: h.name,
          kind: h.kind_name,
          address: h.address,
          phone: h.phone,
          latitude: h.latitude,
          longitude: h.longitude,
        })),
        clusters: [],
      };
    }

    const cellLat = (area.north - area.south) / GRID_ROWS;
    const cellLng = (area.east - area.west) / GRID_COLS;
    const cells = await inBox
      .select([
        sql<number>`floor((latitude - ${area.south}) / ${cellLat})`.as('gy'),
        sql<number>`floor((longitude - ${area.west}) / ${cellLng})`.as('gx'),
        sql<number>`count(*)::int`.as('count'),
        sql<number>`avg(latitude)`.as('latitude'),
        sql<number>`avg(longitude)`.as('longitude'),
      ])
      .groupBy(['gy', 'gx'])
      .execute();
    return {
      hospitals: [],
      clusters: cells.map((c) => ({ latitude: Number(c.latitude), longitude: Number(c.longitude), count: Number(c.count) })),
    };
  }
}

function toRow(item: ApiItem, syncedAt: Date) {
  const latitude = Number(item.YPos);
  const longitude = Number(item.XPos);
  // 좌표가 없는 곳은 지도에 못 띄웁니다
  if (!item.ykiho || !item.yadmNm || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude === 0 || longitude === 0) return [];
  return [
    {
      ykiho: item.ykiho,
      name: item.yadmNm,
      kind_code: item.clCd == null ? null : String(item.clCd).padStart(2, '0'),
      kind_name: item.clCdNm ?? null,
      address: item.addr ?? null,
      phone: item.telno ?? null,
      latitude,
      longitude,
      synced_at: syncedAt,
    },
  ];
}

const coordinate = (limit: number) => z.string().trim().min(1).transform(Number).pipe(z.number().min(-limit).max(limit));
const areaQuery = z
  .object({ south: coordinate(90), west: coordinate(180), north: coordinate(90), east: coordinate(180) })
  .refine((a) => a.north > a.south && a.east > a.west, '영역이 올바르지 않아요')
  // 나라 전체만큼 넓으면 묶음 계산이 무거워집니다. 그 정도로 축소했으면 병원을 볼 일이 없습니다
  .refine((a) => a.north - a.south <= 5 && a.east - a.west <= 5, '영역이 너무 넓어요');

@Controller('hospitals')
@UseGuards(AuthGuard)
class HospitalsController {
  constructor(private readonly hospitals: HospitalsService) {}

  @Get()
  inArea(@Query() q: unknown) {
    return this.hospitals.inArea(parseInput(areaQuery, q));
  }
}

@Module({ controllers: [HospitalsController], providers: [HospitalsService], exports: [HospitalsService] })
export class HospitalsModule implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(HospitalsModule.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(@Inject(HospitalsService) private readonly hospitals: HospitalsService) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.run(), CHECK_INTERVAL_MS);
    // 서버가 막 뜰 때 다른 일과 겹치지 않게 조금 뒤에
    setTimeout(() => void this.run(), 60_000).unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  private async run() {
    try {
      await this.hospitals.syncIfStale();
    } catch (error) {
      // 못 받아도 예전 목록으로 지도는 그대로 보입니다. 다음 주기에 다시 받습니다
      this.logger.error(`병원 목록 갱신 실패: ${String(error)}`);
    }
  }
}
