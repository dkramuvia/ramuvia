import { Controller, Get, Inject, Module, ServiceUnavailableException } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { sql } from 'kysely';

import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { LocationModule } from '../location/location.module.js';
import { LocationService } from '../location/location.service.js';
import { REDIS } from '../redis/redis.module.js';

/** GET /health: 본 DB·위치 DB·Redis 연결 확인 (서버 모니터링·로드밸런서용) */
@Controller('health')
class HealthController {
  constructor(
    @Inject(MAIN_DB) private readonly db: MainDb,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly location: LocationService,
  ) {}

  @Get()
  async check() {
    const checks = await Promise.allSettled([
      sql`SELECT 1`.execute(this.db),
      this.location.ping(),
      this.redis.ping(),
    ]);
    const [mainDb, locationDb, redis] = checks.map((c) => (c.status === 'fulfilled' ? 'ok' : 'error'));
    const result = { status: checks.every((c) => c.status === 'fulfilled') ? 'ok' : 'error', mainDb, locationDb, redis };
    if (result.status !== 'ok') throw new ServiceUnavailableException(result);
    return result;
  }
}

@Module({ imports: [LocationModule], controllers: [HealthController] })
export class HealthModule {}
