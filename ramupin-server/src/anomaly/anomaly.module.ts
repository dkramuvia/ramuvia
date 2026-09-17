import { Controller, Get, Inject, Logger, Module, Param, ParseUUIDPipe, Post, UseGuards, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard.js';
import { RealtimeModule } from '../chat/chat.gateway.js';
import { LocationModule } from '../location/location.module.js';
import { AnomalyService } from './anomaly.service.js';

/**
 * 모니터링 사이트가 읽는 API (docs/anomaly-alerts.md).
 * 목록에 뜬 건은 회사가 직접 전화합니다. 확인콜·출동 기록은 만들지 않습니다.
 *
 * TODO(관리자 웹): 지금은 로그인한 사용자면 누구나 볼 수 있습니다.
 *   관리자 계정 개념(WBS 3.3 등급 0, 11.4 관리자 웹)이 생기면 관리자 전용으로 막아야 합니다.
 */
@Controller('monitoring/anomalies')
@UseGuards(AuthGuard)
class AnomalyController {
  constructor(private readonly anomaly: AnomalyService) {}

  /** 아직 안 풀린 이상징후 목록 (최근 순) */
  @Get()
  list() {
    return this.anomaly.openEvents();
  }

  /** 사람이 보고 "확인함"을 눌렀을 때 */
  @Post(':id/acknowledge')
  async acknowledge(@Param('id', ParseUUIDPipe) id: string) {
    await this.anomaly.acknowledge(id);
    return { ok: true };
  }
}

/** 감시를 몇 분마다 돌릴지. 가장 짧은 단계가 30분이라 5분이면 충분합니다 */
const SWEEP_INTERVAL_MS = 5 * 60_000;

@Module({
  imports: [LocationModule, RealtimeModule],
  controllers: [AnomalyController],
  providers: [AnomalyService],
  exports: [AnomalyService],
})
export class AnomalyModule implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(AnomalyModule.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(@Inject(AnomalyService) private readonly anomaly: AnomalyService) {}

  onModuleInit() {
    // TODO(운영): 서버를 여러 대로 늘리면 이 배치는 한 대에서만 돌아야 합니다.
    //   지금은 중복 기록이 부분 유니크 인덱스로 막히지만, 알림은 중복될 수 있습니다.
    this.timer = setInterval(() => void this.run(), SWEEP_INTERVAL_MS);
    void this.run();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  private async run() {
    try {
      await this.anomaly.sweep();
    } catch (error) {
      // 한 번 실패해도 다음 주기에 다시 돕니다
      this.logger.error(`이상징후 감시 실패: ${String(error)}`);
    }
  }
}
