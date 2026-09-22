import { Body, Controller, Delete, Get, Module, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { AuthGuard, CurrentUser, type AuthUser } from '../auth/auth.guard.js';
import { RealtimeModule } from '../chat/chat.gateway.js';
import { parseInput } from '../common/app-error.js';
import { PushModule } from '../push/push.module.js';
import { SafeZoneService } from './safe-zone.service.js';

/**
 * 안심장소(지오펜스) API (WBS 8.8, 9.4).
 * 앱은 지금까지 목업으로 쓰던 `/geofences` 를 그대로 씁니다 (src/api/endpoints/settings.ts).
 */

const zoneBody = z.object({
  name: z.string().min(1).max(50),
  address: z.string().max(300).default(''),
  center: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }),
  // 50m 보다 작으면 위치 오차만으로 들락거림이 반복됩니다 (zone-crossing.ts 설명 참고)
  radiusM: z.number().int().min(50).max(5000),
  enabled: z.boolean().default(true),
  recipientFriendIds: z.array(z.uuid()).max(200).default([]),
});

@Controller('geofences')
@UseGuards(AuthGuard)
class SafeZoneController {
  constructor(private readonly zones: SafeZoneService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.zones.list(user.id);
  }

  /** 내가 드나든 기록 (알림 보관함·이동 기록) */
  @Get('events')
  events(@CurrentUser() user: AuthUser) {
    return this.zones.events(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.zones.create(user.id, toInput(body));
  }

  @Put(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.zones.update(user.id, id, toInput(body));
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.zones.remove(user.id, id);
  }
}

function toInput(body: unknown) {
  const input = parseInput(zoneBody, body);
  return {
    name: input.name,
    address: input.address,
    latitude: input.center.latitude,
    longitude: input.center.longitude,
    radiusM: input.radiusM,
    enabled: input.enabled,
    recipientFriendIds: input.recipientFriendIds,
  };
}

@Module({
  imports: [RealtimeModule, PushModule],
  controllers: [SafeZoneController],
  providers: [SafeZoneService],
  exports: [SafeZoneService],
})
export class SafeZoneModule {}
