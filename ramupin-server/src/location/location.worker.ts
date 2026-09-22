import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';

import { LocationQueue } from './location.queue.js';
import { LocationService } from './location.service.js';

/**
 * 큐에 쌓인 위치를 DB 에 저장하는 워커 (GPS 보고서 4장).
 *
 * API 서버와 같은 프로세스에서 돕니다. 서버가 한 대라 따로 띄울 이유가 없고,
 * 나중에 서버를 늘리면 이 파일만 별도 프로세스로 실행하면 됩니다
 * (Redis Consumer Group 이라 여러 워커가 같은 큐를 나눠 가집니다).
 */

/** 큐가 비었을 때 다음 확인까지 쉬는 시간(ms). take() 자체가 기다리므로 짧게 둡니다 */
const IDLE_MS = 200;
/** DB 가 잠깐 죽었을 때 다시 시도하기 전 쉬는 시간 */
const RETRY_MS = 3000;
/** 밀린 정도를 확인해 로그를 남기는 간격 */
const BACKLOG_CHECK_MS = 60_000;

@Injectable()
export class LocationWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(LocationWorker.name);
  private stopped = false;
  private backlogTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly queue: LocationQueue,
    private readonly location: LocationService,
  ) {}

  onModuleInit() {
    void this.loop();
    this.backlogTimer = setInterval(() => void this.queue.warnIfBehind().catch(() => undefined), BACKLOG_CHECK_MS);
    this.logger.log('위치 저장 워커 시작');
  }

  onApplicationShutdown() {
    this.stopped = true;
    if (this.backlogTimer) clearInterval(this.backlogTimer);
  }

  private async loop() {
    while (!this.stopped) {
      try {
        const batches = await this.queue.take();
        if (batches.length === 0) {
          await sleep(IDLE_MS);
          continue;
        }

        const done: string[] = [];
        for (const batch of batches) {
          try {
            await this.location.savePoints(batch.userId, batch.points);
            done.push(batch.messageId);
          } catch (error) {
            // 이 건만 ack 하지 않습니다. 큐에 남아 있다가 다시 시도됩니다
            this.logger.error(`위치 저장 실패 (user ${batch.userId}): ${String(error)}`);
          }
        }
        await this.queue.ack(done);
      } catch (error) {
        // Redis 나 DB 가 통째로 죽은 경우. 촘촘히 재시도하면 로그만 쌓이므로 쉬었다 갑니다
        this.logger.error(`위치 저장 워커 오류: ${String(error)}`);
        await sleep(RETRY_MS);
      }
    }
    this.logger.log('위치 저장 워커 종료');
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
