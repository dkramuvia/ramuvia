import { NativeModule, requireNativeModule } from 'expo';

import type { ActivityStatus, EnabledProviders, SatelliteStatus } from './RamupinGps.types';

declare class RamupinGpsModule extends NativeModule {
  /** 위성 상태 구독 시작. 위치 권한이 없으면 false */
  startSatelliteUpdates(): boolean;
  stopSatelliteUpdates(): void;
  /** 마지막 위성 상태. 아직 못 받았으면 null */
  getSatellites(): SatelliteStatus | null;
  getEnabledProviders(): EnabledProviders;
  /** 신체 활동 인식 권한 (걷기·차량 판별) */
  hasActivityPermission(): boolean;
  /** 활동 인식 구독 시작. 권한이 없으면 false */
  startActivityUpdates(intervalMs: number): Promise<boolean>;
  stopActivityUpdates(): Promise<boolean>;
  /** 마지막으로 감지한 활동. 아직 못 받았으면 null */
  getActivity(): ActivityStatus | null;
}

export default requireNativeModule<RamupinGpsModule>('RamupinGps');
