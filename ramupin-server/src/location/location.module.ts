import { BadRequestException, Body, Controller, ForbiddenException, Inject, Module, Post, UseGuards, type OnApplicationShutdown } from '@nestjs/common';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { z } from 'zod';

import { AuthGuard, CurrentUser, type AuthUser } from '../auth/auth.guard.js';
import { RealtimeModule } from '../chat/chat.gateway.js';
import { PushModule } from '../push/push.module.js';
import { SafeZoneModule } from '../safe-zones/safe-zone.module.js';
import { env } from '../config/env.js';
import type { LocationDatabase } from './location.schema.js';
import { LocationQueue } from './location.queue.js';
import { LOCATION_DB, LocationService } from './location.service.js';
import { LocationWorker } from './location.worker.js';
import { RetentionService } from './retention.service.js';
import { SpeedingService } from './speeding.service.js';

const pointSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  measuredAt: z.iso.datetime({ offset: true }),
  altitude: z.number().nullish(),
  accuracy: z.number().nonnegative().nullish(),
  altitudeAccuracy: z.number().nonnegative().nullish(),
  speed: z.number().nullish(),
  heading: z.number().nullish(),
  provider: z.string().max(20).nullish(),
  satellites: z.number().int().nonnegative().nullish(),
  signalStrength: z.number().nullish(),
  battery: z.number().int().min(0).max(100).nullish(),
  charging: z.boolean().nullish(),
  activity: z.enum(['still', 'walking', 'running', 'bicycle', 'vehicle', 'tilting', 'unknown']).nullish(),
  state: z.enum(['sos', 'geofence', 'low_battery', 'moving', 'still']).nullish(),
});

// 오프라인 동안 쌓인 점을 한 번에 보낼 수 있게 최대 500개
const uploadBody = z.object({ points: z.array(pointSchema).min(1).max(500) });

@Controller('locations')
@UseGuards(AuthGuard)
class LocationController {
  constructor(
    private readonly location: LocationService,
    private readonly queue: LocationQueue,
    private readonly speeding: SpeedingService,
  ) {}

  /** 앱 → 서버 위치 전송 (배치) */
  @Post()
  async upload(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const parsed = uploadBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException(z.prettifyError(parsed.error));
    const points = parsed.data.points;

    // 현재 위치와 실시간 전달은 지금(메모리 작업), 이력 저장은 큐로 (GPS 보고서 4장).
    // DB 를 기다리지 않으므로 순간적으로 몰려도 앱 응답이 느려지지 않습니다
    await this.location.updateCurrent(user.id, points);
    await this.queue.enqueue(user.id, points);
    return { received: points.length, queued: true };
  }

  /**
   * 과속 경고의 "방금 울렸으니 쉬어라" 기록을 비웁니다 (확인 스크립트용).
   * 개발용 로그인과 같은 스위치로 막습니다 — 운영에서는 꺼져 있습니다.
   */
  @Post('reset-speeding')
  resetSpeeding(@CurrentUser() user: AuthUser) {
    if (!env.DEV_LOGIN_ENABLED) throw new ForbiddenException('개발용 기능이 꺼져 있습니다');
    this.speeding.resetCooldown(user.id);
    return { ok: true };
  }
}

@Module({
  // 보고 있는 친구에게 위치를 즉시 전달하기 위해 (GPS 보고서 4-3)
  // 안심장소 판정은 위치가 저장될 때 함께 합니다 (WBS 9.4)
  imports: [RealtimeModule, SafeZoneModule, PushModule],
  controllers: [LocationController],
  providers: [
    {
      // ★ 위치 DB 연결은 이 모듈 안에만 있습니다 (exports 하지 않음)
      provide: LOCATION_DB,
      useFactory: () =>
        new Kysely<LocationDatabase>({
          dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: env.LOCATION_DATABASE_URL, max: 10 }) }),
        }),
    },
    LocationService,
    LocationQueue,
    LocationWorker,
    SpeedingService,
    RetentionService,
  ],
  exports: [LocationService],
})
export class LocationModule implements OnApplicationShutdown {
  constructor(@Inject(LocationService) private readonly location: LocationService) {}

  async onApplicationShutdown() {
    await this.location.close();
  }
}
