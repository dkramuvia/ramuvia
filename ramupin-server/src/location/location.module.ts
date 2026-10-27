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
  // 시각은 받자마자 UTC(…Z) 한 가지 모양으로 바꿉니다. 서버는 이 값을 **글자로 비교**하는데,
  // +09:00 과 Z 가 섞이면 순서가 뒤집혀 옛 위치가 현재 위치가 됐습니다 (10-12 자동 시험)
  measuredAt: z.iso.datetime({ offset: true }).transform((s) => new Date(s).toISOString()),
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

/** 폰 시계가 조금 빠른 것은 봐줍니다 */
const FUTURE_SLACK_MS = 5 * 60_000;
/** 앱이 오프라인 점을 들고 있는 기간과 같습니다 (앱 uploader.ts 의 MAX_AGE_MS) */
const MAX_AGE_MS = 7 * 24 * 60 * 60_000;

/**
 * 받을 수 있는 시각의 점만 남깁니다.
 *
 * 폰 시계가 크게 틀어져 먼 미래(예: 2031년) 점이 하나 섞이면, 그 달의 저장 칸(파티션)이 없어
 * **같은 묶음의 정상 점까지 저장되지 않고** 워커가 같은 묶음을 계속 다시 시도했습니다.
 * 현재 위치도 2031년으로 남아 이후의 진짜 위치가 무시됐습니다 (10-12 자동 시험).
 * 묶음 전체를 거절하면 앱이 같은 묶음을 계속 다시 보내므로, 이상한 점만 버립니다.
 */
function acceptable<T extends { measuredAt: string }>(points: T[], now = Date.now()): T[] {
  return points.filter((p) => {
    const at = Date.parse(p.measuredAt);
    return at <= now + FUTURE_SLACK_MS && at >= now - MAX_AGE_MS;
  });
}

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
    // 보호자 동의 대기 중(보완 4.1)·숨김 모드 "서버에도 안 보내기"(WBS 12.7) 에는 위치를 받지 않습니다
    if (await this.location.refusesLocation(user.id)) return { received: 0, dropped: parsed.data.points.length, queued: false };
    const points = acceptable(parsed.data.points);
    const dropped = parsed.data.points.length - points.length;
    // 전부 버려졌어도 200 으로 답합니다. 앱은 이 점들을 다시 보내지 않아야 합니다
    if (points.length === 0) return { received: 0, dropped, queued: false };

    // 현재 위치와 실시간 전달은 지금(메모리 작업), 이력 저장은 큐로 (GPS 보고서 4장).
    // DB 를 기다리지 않으므로 순간적으로 몰려도 앱 응답이 느려지지 않습니다
    await this.location.updateCurrent(user.id, points);
    await this.queue.enqueue(user.id, points);
    return { received: points.length, dropped, queued: true };
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
