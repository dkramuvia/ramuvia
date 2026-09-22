import { Logger } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';

import { env } from '../config/env.js';

/**
 * 서버가 여러 대일 때 실시간 전달을 이어 주는 다리 (WBS 7.5).
 *
 * socket.io 는 기본적으로 **자기 프로세스에 붙은 연결에만** 보냅니다.
 * 서버를 두 대로 늘리는 순간, A 에 붙은 사람이 보낸 메시지가 B 에 붙은 사람에게 안 갑니다.
 * 이 어댑터를 끼우면 Redis 를 통해 서로 전달해 줍니다.
 *
 * 연결을 두 개 쓰는 이유: Redis 구독(subscribe) 상태의 연결로는 다른 명령을 보낼 수 없어,
 * 보내는 쪽과 받는 쪽을 따로 둬야 합니다. 전역 Redis 연결을 그대로 쓰면 다른 기능이 멈춥니다.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly log = new Logger(RedisIoAdapter.name);
  private adapterFactory?: ReturnType<typeof createAdapter>;
  private clients: Redis[] = [];

  constructor(app: INestApplicationContext) {
    super(app);
  }

  async connect(): Promise<void> {
    const pub = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3 });
    const sub = pub.duplicate();
    this.clients = [pub, sub];
    this.adapterFactory = createAdapter(pub, sub);
    this.log.log('실시간 전달을 Redis 로 연결했습니다 (서버 여러 대 대응)');
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    if (this.adapterFactory) server.adapter(this.adapterFactory);
    return server;
  }

  async close(): Promise<void> {
    await Promise.all(this.clients.map((c) => c.quit().catch(() => undefined)));
    this.clients = [];
  }
}
