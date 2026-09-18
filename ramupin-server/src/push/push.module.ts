import { Body, Controller, Delete, HttpCode, HttpStatus, Module, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { AuthGuard, CurrentUser, type AuthUser } from '../auth/auth.guard.js';
import { parseInput } from '../common/app-error.js';
import { PushService } from './push.service.js';

const tokenBody = z.object({
  token: z.string().min(10).max(500),
  platform: z.enum(['android', 'ios', 'web']),
});
const removeBody = z.object({ token: z.string().min(10).max(500) });

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
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
