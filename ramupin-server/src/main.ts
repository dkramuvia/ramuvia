import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { RedisIoAdapter } from './chat/redis-io.adapter.js';
import { env } from './config/env.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  // 서버를 여러 대로 늘려도 실시간 전달이 서로 닿도록 (WBS 7.5)
  const ws = new RedisIoAdapter(app);
  await ws.connect();
  app.useWebSocketAdapter(ws);
  // 폰(USB adb reverse / 같은 와이파이)에서 접속할 수 있게 모든 주소에서 받음
  await app.listen(env.API_PORT, '0.0.0.0');
  console.log(`ramupin-server listening on http://localhost:${env.API_PORT} (${env.NODE_ENV})`);
}
await bootstrap();
