import * as SecureStore from 'expo-secure-store';

/**
 * 인증 비밀값은 기기 보안 저장소(Android Keystore)에 보관합니다.
 * 앱을 지우면 함께 지워지므로, 재설치하면 새 기기로 인식돼 문자 인증을 다시 받습니다.
 */
const KEYS = {
  installationId: 'ramupin.installation-id',
  deviceKey: 'ramupin.device-key',
  refreshToken: 'ramupin.refresh-token',
} as const;

type SecureKey = keyof typeof KEYS;

export const secureStorage = {
  get: (key: SecureKey) => SecureStore.getItemAsync(KEYS[key]),
  set: (key: SecureKey, value: string) => SecureStore.setItemAsync(KEYS[key], value),
  remove: (key: SecureKey) => SecureStore.deleteItemAsync(KEYS[key]),
};
