import { Inject, Logger, Module, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';

import { RealtimeModule } from '../chat/chat.gateway.js';
import { LocationModule } from '../location/location.module.js';
import { PushModule } from '../push/push.module.js';
import { AnomalyService } from './anomaly.service.js';

/** 감시를 몇 분마다 돌릴지. 가장 짧은 단계가 30분이라 5분이면 충분합니다 */
const SWEEP_INTERVAL_MS = 5 * 60_000;

@Module({
  imports: [LocationModule, RealtimeModule, PushModule],
  // 모니터링 사이트 API 는 관리자 로그인으로 막아야 해서 admin/monitoring.controller.ts 에 있습니다.
  // 남의 실시간 위치가 보이는 화면이라 앱 사용자 아무나 볼 수 있으면 안 됩니다
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
