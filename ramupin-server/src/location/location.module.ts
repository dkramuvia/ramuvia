import { BadRequestException, Body, Controller, Inject, Module, Post, UseGuards, type OnApplicationShutdown } from '@nestjs/common';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { z } from 'zod';

import { AuthGuard, CurrentUser, type AuthUser } from '../auth/auth.guard.js';
import { env } from '../config/env.js';
import type { LocationDatabase } from './location.schema.js';
import { LOCATION_DB, LocationService } from './location.service.js';

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
  state: z.enum(['sos', 'geofence', 'low_battery', 'moving', 'still']).nullish(),
});

// 오프라인 동안 쌓인 점을 한 번에 보낼 수 있게 최대 500개
const uploadBody = z.object({ points: z.array(pointSchema).min(1).max(500) });

@Controller('locations')
@UseGuards(AuthGuard)
class LocationController {
  constructor(private readonly location: LocationService) {}

  /** 앱 → 서버 위치 전송 (배치) */
  @Post()
  async upload(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const parsed = uploadBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException(z.prettifyError(parsed.error));
    return this.location.savePoints(user.id, parsed.data.points);
  }
}

@Module({
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
  ],
  exports: [LocationService],
})
export class LocationModule implements OnApplicationShutdown {
  constructor(@Inject(LocationService) private readonly location: LocationService) {}

  async onApplicationShutdown() {
    await this.location.close();
  }
}
