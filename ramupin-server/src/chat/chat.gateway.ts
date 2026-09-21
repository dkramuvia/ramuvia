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

  /** 사용자별 "지금 누가 보고 있는가". 값이 바뀔 때만 폰에 알립니다 */
  private readonly watchMode = new Map<string, boolean>();

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
    this.registerWatching(client);
    this.logger.log(`연결: user ${payload.sub} (방 ${groups.length}개)`);
  }

  /**
   * "지금 누구 지도를 보고 있다" (GPS 보고서 2-1 6번, 4-3).
   *
   * 아무도 안 볼 때도 촘촘히 보내면 배터리와 서버를 그냥 버리는 셈입니다.
   * 보는 사람이 생기면 그 사람의 폰에만 "고빈도 모드"를 켜라고 알리고, 아무도 안 보면 되돌립니다.
   */
  private registerWatching(client: Socket) {
    const me = client.data.userId as string;

    client.on('watch', async (payload: unknown) => {
      const targets = await this.friendsAmong(me, toIdList(payload));
      const before = (client.data.watching as string[] | undefined) ?? [];
      // 이번에 빠진 대상은 먼저 정리합니다
      for (const id of before) if (!targets.includes(id)) await this.leaveWatch(client, id);
      for (const id of targets) if (!before.includes(id)) await client.join(watchRoom(id));
      client.data.watching = targets;
      for (const id of targets) this.syncWatchMode(id);
    });

    client.on('unwatch', async () => {
      for (const id of ((client.data.watching as string[] | undefined) ?? [])) await this.leaveWatch(client, id);
      client.data.watching = [];
    });

    client.on('disconnect', () => {
      // 연결이 끊기면 socket.io 가 방에서 자동으로 빼지만, 상대 폰에 알리는 것은 우리가 해야 합니다
      for (const id of ((client.data.watching as string[] | undefined) ?? [])) setTimeout(() => this.syncWatchMode(id), 0);
    });
  }

  private async leaveWatch(client: Socket, targetId: string) {
    await client.leave(watchRoom(targetId));
    this.syncWatchMode(targetId);
  }

  /** 보는 사람이 있는지 세어 보고, 달라졌으면 그 사람 폰에 알립니다 */
  private syncWatchMode(targetId: string) {
    const watchers = this.server?.sockets.adapter.rooms.get(watchRoom(targetId))?.size ?? 0;
    const on = watchers > 0;
    if (this.watchMode.get(targetId) === on) return;
    this.watchMode.set(targetId, on);
    this.server?.to(`user:${targetId}`).emit('watch-mode', { on });
  }

  /** 친구인 사람만 볼 수 있습니다. 모르는 사람 ID 를 넣어 위치를 받아 가지 못하게 */
  private async friendsAmong(me: string, ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .selectFrom('social.friendships')
      .select('friend_id')
      .where('user_id', '=', me)
      .where('friend_id', 'in', ids)
      .execute();
    return rows.map((r) => r.friend_id);
  }

  /** 보고 있는 사람에게만 위치를 즉시 전달. 아무도 안 보면 Redis 갱신만 하고 끝냅니다 */
  emitLocation(userId: string, location: unknown) {
    this.server?.to(watchRoom(userId)).emit('friend-location', { userId, location });
  }

  /** 지금 이 사람을 보고 있는 사람이 있는지 (위치 저장 쪽에서 확인) */
  hasWatchers(userId: string): boolean {
    return (this.server?.sockets.adapter.rooms.get(watchRoom(userId))?.size ?? 0) > 0;
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

  /**
   * 이상징후 알림을 친구에게 전달 (docs/anomaly-alerts.md).
   * 앱이 켜져 있을 때만 닿습니다. 꺼져 있을 때는 푸시가 필요합니다 (6단계).
   */
  /** SOS 를 받을 사람에게 즉시 전달. 앱이 켜져 있으면 푸시보다 먼저 닿습니다 */
  emitSos(userIds: string[], payload: unknown) {
    for (const userId of userIds) this.server?.to(`user:${userId}`).emit('sos', payload);
  }

  emitAnomaly(userIds: string[], payload: unknown) {
    for (const userId of userIds) this.server?.to(`user:${userId}`).emit('anomaly', payload);
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

/** 이 사람의 위치를 보고 있는 사람들이 모이는 방 */
const watchRoom = (userId: string) => `watch:${userId}`;

/** 앱이 보낸 목록에서 UUID 만 골라냅니다 (최대 100명) */
function toIdList(payload: unknown): string[] {
  const raw = (payload as { userIds?: unknown } | undefined)?.userIds;
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string' && UUID_RE.test(v)).slice(0, 100);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
