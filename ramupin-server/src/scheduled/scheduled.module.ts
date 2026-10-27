import { Body, Controller, Delete, ForbiddenException, Get, Module, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { AuthGuard, CurrentUser, type AuthUser } from '../auth/auth.guard.js';
import { parseInput } from '../common/app-error.js';
import { env } from '../config/env.js';
import { PushModule } from '../push/push.module.js';
import { ScheduledMessageService, type ScheduledMessageInput } from './scheduled-message.service.js';
import { ScheduledSenderService } from './scheduled-sender.service.js';

/**
 * 예약 메시지 API (WBS 8.2).
 * 앱이 지금까지 목업으로 쓰던 `/scheduled-messages` 를 그대로 씁니다
 * (앱: src/api/endpoints/settings.ts 의 scheduledMessagesApi).
 */

const messageBody = z.object({
  targetUserId: z.uuid(),
  title: z.string().min(1).max(50),
  body: z.string().min(1).max(500),
  scheduledAt: z.iso.datetime(),
  tts: z.boolean().default(true),
  /**
   * 받는 사람이 다른 나라에 있을 때 기준 시각 (보완 4.14 "예약 메시지 기준 시간").
   * recipient 면 고른 날짜·시각(localTime)을 **받는 사람이 있는 곳**의 시각으로 보고 서버가 다시 계산합니다.
   * 없거나 mine 이면 앱이 보낸 scheduledAt(보내는 사람 폰 시각 기준) 그대로
   */
  timezoneBasis: z.enum(['recipient', 'mine']).optional(),
  localTime: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).optional(),
});

function toInput(body: unknown): ScheduledMessageInput {
  const input = parseInput(messageBody, body);
  return {
    targetUserId: input.targetUserId,
    title: input.title,
    body: input.body,
    scheduledAt: new Date(input.scheduledAt),
    tts: input.tts,
    ...(input.timezoneBasis === 'recipient' && input.localTime ? { recipientLocalTime: input.localTime } : {}),
  };
}

@Controller('scheduled-messages')
@UseGuards(AuthGuard)
class ScheduledMessageController {
  constructor(
    private readonly messages: ScheduledMessageService,
    private readonly sender: ScheduledSenderService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.messages.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.messages.create(user.id, toInput(body));
  }

  @Put(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.messages.update(user.id, id, toInput(body));
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.messages.remove(user.id, id);
  }

  /**
   * 발송기를 한 바퀴 바로 돌립니다 (확인 스크립트용).
   *
   * 평소에는 30초마다 저절로 돕니다. 확인 스크립트가 30초를 기다리지 않게 하려고 둡니다.
   * 개발용 로그인과 같은 스위치로 막습니다 — 운영에서는 꺼져 있습니다.
   */
  @Post('run-sender')
  runSender() {
    if (!env.DEV_LOGIN_ENABLED) throw new ForbiddenException('개발용 기능이 꺼져 있습니다');
    return this.sender.run();
  }
}

@Module({
  imports: [PushModule],
  controllers: [ScheduledMessageController],
  providers: [ScheduledMessageService, ScheduledSenderService],
  exports: [ScheduledMessageService, ScheduledSenderService],
})
export class ScheduledModule {}
