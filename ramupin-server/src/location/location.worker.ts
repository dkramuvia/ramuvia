import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';

import { DangerZoneService } from '../safe-zones/danger-zone.service.js';
import { SafeZoneService } from '../safe-zones/safe-zone.service.js';
import { SpeedingService } from './speeding.service.js';
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
    private readonly zones: SafeZoneService,
    private readonly speeding: SpeedingService,
    private readonly dangerZones: DangerZoneService,
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
            // 안심장소를 드나들었는지 (WBS 9.4). 판정이 실패해도 저장은 끝난 뒤라
            // 이 건을 다시 처리하지 않습니다 — check() 는 예외를 밖으로 내지 않습니다
            await this.checkSafeZones(batch.userId, batch.points);
            // 과속인지 (WBS 8.1). 판정이 실패해도 저장은 끝난 뒤라 이 건을 다시 처리하지 않습니다
            await this.checkSpeeding(batch.userId, batch.points);
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

  /**
   * 이 묶음의 **마지막 위치**로만 판정합니다.
   *
   * 한 묶음에 1분치(정지 1건, 이동 4건)가 들어 있는데, 그 사이에 들어갔다 나온 경우까지
   * 모두 잡으려면 점마다 판정해야 합니다. 다만 안심장소는 보통 반경 100m 이상이라
   * 1분 안에 들어갔다 나오는 일은 드물고, 매 점마다 보면 DB 쓰기가 5배가 됩니다.
   * 진입·이탈을 놓치지 않는 건 폰 쪽 5초 수집이 맡습니다 (GPS 보고서 2-1 2번).
   */
  private async checkSafeZones(userId: string, points: { latitude: number; longitude: number; accuracy?: number | null; measuredAt: string }[]) {
    const latest = points.reduce((a, b) => (a.measuredAt >= b.measuredAt ? a : b));
    const fix = {
      latitude: latest.latitude,
      longitude: latest.longitude,
      accuracy: latest.accuracy ?? null,
      measuredAt: new Date(latest.measuredAt),
    };
    await this.zones.check(userId, fix);
    // 위험지역도 같은 위치로 함께 봅니다 (WBS 9.6)
    await this.dangerZones.check(userId, fix);
  }
  /**
   * 과속인지 (WBS 8.1).
   *
   * **속도 단위를 여기서 바꿉니다.** 기기가 보내는 값은 **m/s** 이고 판정은 km/h 로 합니다.
   * 그대로 넘기면 시속 120km(=33m/s)가 33 으로 읽혀 과속을 영영 못 잡습니다.
   */
  private async checkSpeeding(userId: string, points: { speed?: number | null; measuredAt: string }[]) {
    await this.speeding.check(
      userId,
      points.map((p) => ({
        speedKmh: p.speed == null ? null : p.speed * 3.6,
        measuredAt: new Date(p.measuredAt),
      })),
    );
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
