import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { REDIS } from '../redis/redis.module.js';

/**
 * "지금 이 사람 지도를 누가 보고 있는가" 를 서버 여러 대에서 함께 보는 장부 (GPS 보고서 2-1 6번).
 *
 * 왜 메모리가 아니라 Redis 인가
 *   서버가 두 대가 되면, A 서버에 붙은 친구가 보고 있는데 B 서버가 위치를 받습니다.
 *   B 는 A 의 메모리를 볼 수 없어 "아무도 안 본다" 고 판단하고 전달을 건너뜁니다.
 *   그래서 보는 사람 목록은 모든 서버가 같이 읽는 곳에 둡니다.
 *
 * 왜 집합이 아니라 정렬 집합(ZSET)인가
 *   서버가 죽으면 "보기를 끝냈다" 는 신호가 영영 안 옵니다. 그대로 두면 아무도 안 보는데
 *   촘촘한 수집이 계속 돌아 배터리를 먹습니다. 점수에 만료 시각을 넣어 두고
 *   살아 있는 서버가 60초마다 갱신하게 해서, 죽은 서버의 흔적은 저절로 사라지게 합니다.
 */

/** 갱신이 끊기면 이만큼 뒤에 사라집니다 (심장박동 60초의 3배 여유) */
export const WATCH_TTL_MS = 180_000;

const key = (targetId: string) => `watch:${targetId}`;

@Injectable()
export class WatchRegistry {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /** 보기 시작 (또는 살아 있음을 알림). 여러 대상을 한 번에 갱신합니다 */
  async touch(targetIds: string[], socketId: string): Promise<void> {
    if (targetIds.length === 0) return;
    const expiresAt = Date.now() + WATCH_TTL_MS;
    const pipe = this.redis.pipeline();
    for (const id of targetIds) {
      pipe.zadd(key(id), expiresAt, socketId);
      // 아무도 갱신하지 않으면 키 자체도 사라지게 (쓰레기가 쌓이지 않도록)
      pipe.pexpire(key(id), WATCH_TTL_MS);
    }
    await pipe.exec();
  }

  /** 보기를 끝냄 */
  async remove(targetIds: string[], socketId: string): Promise<void> {
    if (targetIds.length === 0) return;
    const pipe = this.redis.pipeline();
    for (const id of targetIds) pipe.zrem(key(id), socketId);
    await pipe.exec();
  }

  /** 지금 보고 있는 사람 수. 만료된 것은 세면서 같이 치웁니다 */
  async count(targetId: string): Promise<number> {
    const now = Date.now();
    const [, count] = await this.redis
      .pipeline()
      .zremrangebyscore(key(targetId), 0, now)
      .zcard(key(targetId))
      .exec()
      .then((rows) => [rows?.[0]?.[1] ?? 0, Number(rows?.[1]?.[1] ?? 0)] as const);
    return count;
  }
}
