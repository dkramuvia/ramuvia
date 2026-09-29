import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, HttpStatus, Module, Post, Put, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { AuthGuard, CurrentUser, type AuthUser } from '../auth/auth.guard.js';
import { parseInput } from '../common/app-error.js';
import { env } from '../config/env.js';
import { NotificationSettingsService } from './notification-settings.service.js';
import { PushService } from './push.service.js';

const tokenBody = z.object({
  token: z.string().min(10).max(500),
  platform: z.enum(['android', 'ios', 'web']),
});
const removeBody = z.object({ token: z.string().min(10).max(500) });

/** `23:00` 꼴만 받습니다 */
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, '시각은 23:00 형식이어야 합니다');

const categoryQuery = z.object({
  category: z.enum(['sos', 'battery', 'geofence', 'locationRequest', 'friendRequest', 'groupActivity', 'notice', 'marketing', 'speeding']),
});

const settingsBody = z.object({
  dndEnabled: z.boolean(),
  dndStart: hhmm,
  dndEnd: hhmm,
  // 기기가 알려 주는 시간대. 모르면 서울로 봅니다
  timezone: z.string().min(1).max(64).default('Asia/Seoul'),
  sos: z.boolean(),
  battery: z.boolean(),
  geofence: z.boolean(),
  locationRequest: z.boolean(),
  friendRequest: z.boolean(),
  groupActivity: z.boolean(),
  notice: z.boolean(),
  marketing: z.boolean(),
  // 나중에 붙인 항목이라 예전 앱이 안 보낼 수 있습니다. 안 오면 켜진 것으로 봅니다
  speeding: z.boolean().default(true),
});

/**
 * 알림 설정 (WBS 8.1). 앱 [설정 > 알림] 화면.
 *
 * **SOS 는 꺼도 갑니다.** 화면에서는 끌 수 있게 두되(사용자 기대), 서버는 보냅니다.
 * 사람이 위험할 때 오는 알림이라 못 받으면 설정 문제가 아니라 사고가 됩니다.
 */
@Controller('me/notification-settings')
@UseGuards(AuthGuard)
class NotificationSettingsController {
  constructor(private readonly settings: NotificationSettingsService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.settings.get(user.id);
  }

  @Put()
  update(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.settings.update(user.id, parseInput(settingsBody, body));
  }

  /**
   * 지금 이 종류의 알림을 내가 받는지 (확인 스크립트용).
   *
   * 실제 거르기 함수를 그대로 부릅니다 — 스크립트가 같은 판정을 따로 구현하면
   * 복사본만 시험하게 되고, 진짜 코드가 달라져도 모릅니다.
   * 개발용 로그인과 같은 스위치로 막습니다.
   */
  @Get('would-receive')
  async wouldReceive(@CurrentUser() user: AuthUser, @Query('category') category: string) {
    if (!env.DEV_LOGIN_ENABLED) throw new ForbiddenException('개발용 기능이 꺼져 있습니다');
    const parsed = parseInput(categoryQuery, { category });
    const allowed = await this.settings.filterRecipients([user.id], parsed.category);
    return { receives: allowed.length > 0 };
  }
}

/** 푸시 토큰 등록·해제 (WBS 6단계) */
@Controller('me/push-tokens')
@UseGuards(AuthGuard)
class PushController {
  constructor(private readonly push: PushService) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  async register(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const { token, platform } = parseInput(tokenBody, body);
    await this.push.registerToken(user.id, token, platform);
  }

  /** 로그아웃·기기 변경 시 (남의 기기로 알림이 가지 않게) */
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    await this.push.removeToken(user.id, parseInput(removeBody, body).token);
  }
}

@Module({
  controllers: [PushController, NotificationSettingsController],
  providers: [PushService, NotificationSettingsService],
  exports: [PushService, NotificationSettingsService],
})
export class PushModule {}
