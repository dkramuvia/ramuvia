import { Inject, Injectable, Logger, Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

import type { AccessTokenPayload } from '../auth/session.service.js';
import { SessionService } from '../auth/session.service.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import type { ChatMessageResponse } from './chat.service.js';

/**
 * 실시간 전달 (WBS 7.5).
 * 앱은 로그인 토큰으로 연결하고, 내가 속한 방에 자동으로 들어갑니다.
 * 방 이름은 `room:{groupId}`, 개인 알림용으로 `user:{userId}` 에도 들어갑니다.
 *
 * TODO(서버 여러 대): @socket.io/redis-adapter 로 서버 간 전달
 * TODO(푸시 단계): 연결되지 않은 사람에게는 푸시 알림
 */
@Injectable()
@WebSocketGateway({ cors: { origin: '*' }, path: '/ws' })
export class ChatGateway implements OnGatewayConnection {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly sessions: SessionService,
    @Inject(MAIN_DB) private readonly db: MainDb,
  ) {}

  async handleConnection(client: Socket) {
    const token = (client.handshake.auth?.token as string | undefined) ?? (client.handshake.query.token as string | undefined);
    if (!token) return this.reject(client, 'TOKEN_MISSING');

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      return this.reject(client, 'TOKEN_INVALID');
    }
    if (!payload.sid) return this.reject(client, 'SESSION_REVOKED');
    try {
      // 기기 1대 로그인: 끊긴 기기는 실시간 연결도 거절
      await this.sessions.assertActive(payload.sub, payload.sid);
    } catch {
      return this.reject(client, 'SESSION_REPLACED');
    }

    client.data.userId = payload.sub;
    await client.join(`user:${payload.sub}`);
    const rows = await this.db.selectFrom('social.group_members').select('group_id').where('user_id', '=', payload.sub).execute();
    const groups = rows.map((r) => r.group_id);
    await Promise.all(groups.map((id) => client.join(`room:${id}`)));
    client.emit('ready', { rooms: groups });
    this.logger.log(`연결: user ${payload.sub} (방 ${groups.length}개)`);
  }

  /** 새 메시지를 방 참여자에게 전달 */
  emitMessage(message: ChatMessageResponse) {
    const room = `room:${message.roomId}`;
    this.server?.to(room).emit('message', message);
  }

  /** 방 목록이 바뀐 사람에게 알림 (초대·나가기) */
  emitRoomsChanged(userIds: string[]) {
    for (const userId of userIds) this.server?.to(`user:${userId}`).emit('rooms-changed', {});
  }

  /** 초대된 사람을 방에 즉시 넣어 줍니다 */
  async joinRoom(userIds: string[], roomId: string) {
    for (const userId of userIds) {
      const sockets = await this.server?.in(`user:${userId}`).fetchSockets();
      for (const socket of sockets ?? []) await socket.join(`room:${roomId}`);
    }
  }

  private reject(client: Socket, code: string) {
    client.emit('auth-error', { code });
    client.disconnect(true);
  }
}

/** 실시간 연결은 그룹·채팅 어디서나 쓰므로 별도 모듈로 둡니다 (순환 의존 방지) */
@Module({ providers: [ChatGateway], exports: [ChatGateway] })
export class RealtimeModule {}
