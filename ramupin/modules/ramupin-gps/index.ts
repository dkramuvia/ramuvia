import type { ActivityStatus, ActivityType, EnabledProviders, SatelliteStatus } from './src/RamupinGps.types';

/**
 * GPS 부가 정보 (WBS 2.2·2.3): 위성 수, 신호 강도, 위치 제공자.
 * expo-location 에 없는 값이라 안드로이드 API 를 직접 부릅니다.
 *
 * 주의: 이 모듈은 네이티브 코드라 개발 빌드를 다시 만들어야 동작합니다.
 * 아직 안 들어간 빌드에서도 앱이 죽지 않도록, 모듈이 없으면 조용히 빈 값을 돌려줍니다.
 */

type GpsNative = {
  startSatelliteUpdates(): boolean;
  stopSatelliteUpdates(): void;
  getSatellites(): SatelliteStatus | null;
  getEnabledProviders(): EnabledProviders;
  hasActivityPermission(): boolean;
  startActivityUpdates(intervalMs: number): Promise<boolean>;
  stopActivityUpdates(): Promise<boolean>;
  getActivity(): ActivityStatus | null;
};

let native: GpsNative | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  native = (require('./src/RamupinGpsModule') as { default: GpsNative }).default;
} catch {
  native = null;
}

/** 네이티브 모듈이 이 빌드에 들어 있는지 */
export const isGpsModuleAvailable = () => native !== null;

export function startSatelliteUpdates(): boolean {
  try {
    return native?.startSatelliteUpdates() ?? false;
  } catch {
    return false;
  }
}

export function stopSatelliteUpdates(): void {
  try {
    native?.stopSatelliteUpdates();
  } catch {
    // 구독이 없으면 무시
  }
}

export function getSatellites(): SatelliteStatus | null {
  try {
    return native?.getSatellites() ?? null;
  } catch {
    return null;
  }
}

export function getEnabledProviders(): EnabledProviders | null {
  try {
    return native?.getEnabledProviders() ?? null;
  } catch {
    return null;
  }
}

/** 활동 인식 권한이 있는지 (없으면 구독해도 아무것도 안 옵니다) */
export function hasActivityPermission(): boolean {
  try {
    return native?.hasActivityPermission() ?? false;
  } catch {
    return false;
  }
}

/** 활동 인식 구독 시작 (걷기·자전거·차량·정지) */
export async function startActivityUpdates(intervalMs: number): Promise<boolean> {
  try {
    return (await native?.startActivityUpdates(intervalMs)) ?? false;
  } catch {
    return false;
  }
}

export async function stopActivityUpdates(): Promise<void> {
  try {
    await native?.stopActivityUpdates();
  } catch {
    // 구독이 없으면 무시
  }
}

/** 마지막으로 감지한 활동. 아직 못 받았거나 모듈이 없으면 null */
export function getActivity(): ActivityStatus | null {
  try {
    return native?.getActivity() ?? null;
  } catch {
    return null;
  }
}

export type { ActivityStatus, ActivityType, EnabledProviders, SatelliteStatus };
