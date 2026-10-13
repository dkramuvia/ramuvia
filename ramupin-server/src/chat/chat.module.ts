import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Logger, Module, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { AuthGuard, CurrentUser, type AuthUser } from '../auth/auth.guard.js';
import { parseInput } from '../common/app-error.js';
import { GroupsModule } from '../groups/groups.module.js';
import { GroupsService } from '../groups/groups.service.js';
import { ChatGateway, RealtimeModule } from './chat.gateway.js';
import { ChatService, sendMessageBody, type ChatMessageResponse } from './chat.service.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { PushModule } from '../push/push.module.js';
import { PushService } from '../push/push.service.js';

const historyQuery = z.object({ before: z.iso.datetime({ offset: true }).optional() });

@Controller('chat')
@UseGuards(AuthGuard)
class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(
    private readonly chat: ChatService,
    private readonly gateway: ChatGateway,
    private readonly groups: GroupsService,
    private readonly push: PushService,
    @Inject(MAIN_DB) private readonly db: MainDb,
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
    // 앱을 닫아 둔 사람에게는 푸시로 (10-13 실서버 시험에서 채팅만 알림이 없었습니다).
    // 응답을 늦추지 않게 기다리지 않고, 실패해도 메시지 전송은 성공입니다
    void this.notify(user.id, message).catch((error) => this.logger.warn(`채팅 푸시 실패: ${String(error)}`));
    return message;
  }

  /**
   * 방 사람들(보낸 사람 빼고)에게 채팅 푸시. 앱을 보고 있는 사람에게는 앱이 띄우지 않습니다
   * (앱 push.ts 의 handleNotification). "그룹 활동 알림" 을 끈 사람은 PushService 가 거릅니다
   */
  private async notify(senderId: string, message: ChatMessageResponse) {
    const recipients = (await this.groups.memberIds(message.roomId)).filter((id) => id !== senderId);
    if (recipients.length === 0) return;
    const [sender, room] = await Promise.all([
      this.db.selectFrom('member.users').select('nickname').where('id', '=', senderId).executeTakeFirst(),
      this.db.selectFrom('social.groups').select(['name', 'is_direct']).where('id', '=', message.roomId).executeTakeFirst(),
    ]);
    const nickname = sender?.nickname ?? '알 수 없음';
    const preview = message.type === 'location' ? '위치를 공유했어요.' : (message.text ?? '').slice(0, 100);
    await this.push.sendToUsers(recipients, {
      channel: 'chat',
      // 1:1 은 보낸 사람 이름이 제목, 그룹은 방 이름이 제목이고 본문 앞에 보낸 사람
      title: room?.is_direct ? nickname : (room?.name ?? nickname),
      body: room?.is_direct ? preview : `${nickname}: ${preview}`,
      route: `/chat/${message.roomId}`,
      data: { kind: 'chat', roomId: message.roomId },
    });
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
  imports: [GroupsModule, RealtimeModule, PushModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
