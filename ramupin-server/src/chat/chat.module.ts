import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Module, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { AuthGuard, CurrentUser, type AuthUser } from '../auth/auth.guard.js';
import { parseInput } from '../common/app-error.js';
import { GroupsModule } from '../groups/groups.module.js';
import { GroupsService } from '../groups/groups.service.js';
import { ChatGateway, RealtimeModule } from './chat.gateway.js';
import { ChatService, sendMessageBody } from './chat.service.js';

const historyQuery = z.object({ before: z.iso.datetime({ offset: true }).optional() });

@Controller('chat')
@UseGuards(AuthGuard)
class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly gateway: ChatGateway,
    private readonly groups: GroupsService,
  ) {}

  @Get('rooms')
  rooms(@CurrentUser() user: AuthUser) {
    return this.chat.rooms(user.id);
  }

  /** 지난 대화 (오래된 것 → 최신). before 로 더 이전 대화 */
  @Get('rooms/:roomId/messages')
  messages(@CurrentUser() user: AuthUser, @Param('roomId', ParseUUIDPipe) roomId: string, @Query() query: unknown) {
    return this.chat.messages(user.id, roomId, parseInput(historyQuery, query).before);
  }

  /** 메시지 전송 → 저장 후 WebSocket 으로 방 참여자에게 전달 */
  @Post('rooms/:roomId/messages')
  async send(@CurrentUser() user: AuthUser, @Param('roomId', ParseUUIDPipe) roomId: string, @Body() body: unknown) {
    const message = await this.chat.send(user.id, roomId, parseInput(sendMessageBody, body));
    // 아직 방에 들어가지 않은 접속자(방금 초대됨 등)도 받을 수 있게 먼저 넣어 줍니다
    await this.gateway.joinRoom(await this.groups.memberIds(roomId), roomId);
    this.gateway.emitMessage(message);
    return message;
  }

  @Post('rooms/:roomId/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  read(@CurrentUser() user: AuthUser, @Param('roomId', ParseUUIDPipe) roomId: string) {
    return this.chat.markRead(user.id, roomId);
  }

  /** 서버 대화만 삭제 (기기 보관함은 그대로, WBS 7.6) */
  @Delete('rooms/:roomId/messages')
  @HttpCode(HttpStatus.NO_CONTENT)
  clear(@CurrentUser() user: AuthUser, @Param('roomId', ParseUUIDPipe) roomId: string) {
    return this.chat.clearRoomMessages(user.id, roomId);
  }
}

@Module({
  imports: [GroupsModule, RealtimeModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
