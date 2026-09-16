import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { DeviceInput } from '@/api/endpoints/auth';
import { secureStorage } from './secureStorage';

/**
 * 설치 ID: 기기를 구분하는 이름표일 뿐 비밀값이 아닙니다.
 * 같은 기기임을 증명하는 건 서버가 발급한 기기 키(deviceKey)입니다.
 */
function createInstallationId(): string {
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${hex(4)}-${hex(12)}`;
}

async function getInstallationId(): Promise<string> {
  const saved = await secureStorage.get('installationId');
  if (saved) return saved;
  const id = createInstallationId();
  await secureStorage.set('installationId', id);
  return id;
}

export async function getDeviceInput(): Promise<DeviceInput> {
  const constants = Platform.constants as { Model?: string; Manufacturer?: string; Release?: string };
  return {
    installationId: await getInstallationId(),
    deviceKey: await secureStorage.get('deviceKey'),
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    model: [constants.Manufacturer, constants.Model].filter(Boolean).join(' ') || null,
    osVersion: constants.Release ?? String(Platform.Version),
    appVersion: Constants.expoConfig?.version ?? null,
  };
}
