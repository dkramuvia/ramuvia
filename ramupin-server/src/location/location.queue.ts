import { Inject, Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { hostname } from 'node:os';

import { REDIS } from '../redis/redis.module.js';
import type { LocationPointInput } from './location.service.js';

/**
 * 위치 저장 큐 (GPS 보고서 4장).
 *
 * 앱에서 위치가 오면 그 자리에서 DB 에 쓰지 않고 여기에 넣고 바로 응답합니다.
 * 워커가 뒤에서 모아 저장합니다. 이렇게 나누는 이유:
 *
 *   - **API 가 DB 속도에 묶이지 않습니다.** 지금은 위치 한 번 올릴 때마다 INSERT 가 돌고,
 *     DB 가 느려지면 앱 응답도 같이 느려집니다
 *   - **DB 쓰기를 묶을 수 있습니다.** 건당 INSERT 를 100건씩 모아서 한 번에 씁니다
 *   - 순간적으로 몰려도 큐가 받아 주고, DB 는 자기 속도로 처리합니다
 *
 * 지금은 서버 한 대라 Redis Stream 을 씁니다. Redis 는 이미 돌고 있고 `appendonly yes` 라
 * 서버가 죽어도 큐 내용이 남습니다. 나중에 서버를 늘릴 때는 이 파일의 XADD 를
 * SQS 전송으로 바꾸면 되고, 나머지 코드는 건드리지 않습니다.
 */

const STREAM = 'location:points';
const GROUP = 'location-workers';

/** 한 번에 가져와서 저장할 최대 건수 */
const BATCH = 200;
/** 큐에 새 것이 없을 때 기다리는 시간(ms). 길수록 놀고, 짧을수록 Redis 를 자주 부릅니다 */
const BLOCK_MS = 2000;
/**
 * 큐에 쌓아 둘 최대 개수.
 * DB 가 오래 멈춰 있을 때 Redis 메모리가 끝없이 늘지 않게 막습니다.
 * 이 수를 넘으면 가장 오래된 것부터 사라지므로, 넘치기 전에 경고를 남깁니다.
 */
const MAX_LEN = 200_000;
/** 이 수를 넘으면 밀리고 있다는 뜻이라 로그를 남깁니다 */
const BACKLOG_WARN = 50_000;

/**
 * 처리하다 실패해 남은 것을 이 시간 뒤에 다시 가져갑니다.
 *
 * 워커가 죽은 경우와 저장이 실패한 경우를 같은 값으로 봅니다.
 * 너무 짧으면 DB 가 죽어 있는 동안 계속 두드리고, 너무 길면 복구가 늦습니다.
 * 09-22 확인: 60초로 두니 DB 를 살린 뒤 복구까지 60초가 걸렸습니다.
 */
const STALE_MS = 10_000;

export interface QueuedBatch {
  messageId: string;
  userId: string;
  points: LocationPointInput[];
}

@Injectable()
export class LocationQueue implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(LocationQueue.name);
  /** 워커 이름. 여러 대로 늘려도 서로 구분되게 */
  private readonly consumer = `${hostname()}-${process.pid}`;
  private stopped = false;

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onModuleInit() {
    try {
      // 이미 있으면 BUSYGROUP 오류가 나는데 정상입니다
      await this.redis.xgroup('CREATE', STREAM, GROUP, '0', 'MKSTREAM');
    } catch (error) {
      if (!String(error).includes('BUSYGROUP')) throw error;
    }
  }

  onApplicationShutdown() {
    this.stopped = true;
  }

  /** 앱에서 받은 위치를 큐에 넣습니다. DB 를 기다리지 않습니다 */
  async enqueue(userId: string, points: LocationPointInput[]): Promise<void> {
    if (points.length === 0) return;
    await this.redis.xadd(STREAM, 'MAXLEN', '~', String(MAX_LEN), '*', 'userId', userId, 'points', JSON.stringify(points));
  }

  /**
   * 큐에서 꺼냅니다. 꺼낸 것은 저장이 끝난 뒤 ack() 해야 사라집니다.
   * 저장에 실패해 ack 하지 않으면 큐에 남아 있다가 다시 시도됩니다.
   */
  async take(): Promise<QueuedBatch[]> {
    if (this.stopped) return [];
    // 먼저 죽은 워커가 남긴 것을 가져옵니다 (없으면 곧바로 새 것으로 넘어갑니다)
    const reclaimed = await this.reclaim();
    if (reclaimed.length > 0) return reclaimed;

    const result = (await this.redis.xreadgroup(
      'GROUP',
      GROUP,
      this.consumer,
      'COUNT',
      BATCH,
      'BLOCK',
      BLOCK_MS,
      'STREAMS',
      STREAM,
      '>',
    )) as [string, [string, string[]][]][] | null;
    return this.parse(result?.[0]?.[1] ?? []);
  }

  async ack(messageIds: string[]): Promise<void> {
    if (messageIds.length === 0) return;
    await this.redis.xack(STREAM, GROUP, ...messageIds);
  }

  /** 얼마나 밀려 있는지 (관리자 화면·로그용) */
  async backlog(): Promise<number> {
    const pending = (await this.redis.xpending(STREAM, GROUP)) as [number, ...unknown[]] | null;
    return Number(pending?.[0] ?? 0);
  }

  /** 밀리고 있으면 로그를 남깁니다. 조용히 쌓이다가 큐가 넘치면 위치가 사라집니다 */
  async warnIfBehind(): Promise<void> {
    const behind = await this.backlog();
    if (behind >= BACKLOG_WARN) {
      this.logger.warn(`위치 저장이 밀리고 있습니다: ${behind.toLocaleString()}건 (한도 ${MAX_LEN.toLocaleString()})`);
    }
  }

  /** 워커가 죽어 처리되지 못한 채 남은 것을 되찾습니다 */
  private async reclaim(): Promise<QueuedBatch[]> {
    const result = (await this.redis.xautoclaim(STREAM, GROUP, this.consumer, STALE_MS, '0', 'COUNT', BATCH)) as [
      string,
      [string, string[]][],
      ...unknown[],
    ];
    const entries = result?.[1] ?? [];
    if (entries.length > 0) this.logger.log(`멈춰 있던 ${entries.length}건을 다시 처리합니다`);
    return this.parse(entries);
  }

  private parse(entries: [string, string[]][]): QueuedBatch[] {
    const batches: QueuedBatch[] = [];
    for (const [messageId, fields] of entries) {
      try {
        const map = new Map<string, string>();
        for (let i = 0; i < fields.length; i += 2) map.set(fields[i], fields[i + 1]);
        const userId = map.get('userId');
        const raw = map.get('points');
        if (!userId || !raw) throw new Error('형식이 맞지 않습니다');
        batches.push({ messageId, userId, points: JSON.parse(raw) as LocationPointInput[] });
      } catch (error) {
        // 읽을 수 없는 것은 다시 시도해도 실패하므로 버립니다. 남겨 두면 큐가 막힙니다
        this.logger.error(`큐에서 읽을 수 없는 항목을 버립니다 (${messageId}): ${String(error)}`);
        void this.ack([messageId]);
      }
    }
    return batches;
  }
}
