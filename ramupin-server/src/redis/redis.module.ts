import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';

import { env } from '../config/env.js';

export const REDIS = Symbol('REDIS');

/** 현재 위치 캐시, 인증번호, WebSocket 서버 간 메시지 전달 (서버가 여러 대일 때) */
@Global()
@Module({
  providers: [{ provide: REDIS, useFactory: () => new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3 }) }],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown() {
    await this.redis.quit();
  }
}
