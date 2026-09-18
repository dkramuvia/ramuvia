import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { pushApi } from '@/api/endpoints/push';
import { isLive } from '@/config/env';

/**
 * 푸시 알림 (WBS 6단계, FCM).
 *
 * 앱이 꺼져 있어도 알림이 닿게 합니다. 지금까지는 앱이 켜져 있을 때만 WebSocket 으로 받았는데,
 * SOS·이상징후처럼 정작 중요한 순간에는 앱이 꺼져 있습니다.
 */

/** 상황별 알림 채널 (WBS 7.8: 채널마다 다른 소리). 중요도가 달라 사용자가 따로 끌 수 있습니다 */
export const CHANNELS = {
  sos: { id: 'sos', name: 'SOS 긴급', importance: Notifications.AndroidImportance.MAX },
  danger: { id: 'danger', name: '위험 지역·과속', importance: Notifications.AndroidImportance.HIGH },
  anomaly: { id: 'anomaly', name: '이상징후', importance: Notifications.AndroidImportance.HIGH },
  general: { id: 'general', name: '일반 알림', importance: Notifications.AndroidImportance.DEFAULT },
} as const;

/** 앱이 켜져 있을 때 알림이 오면 어떻게 보여줄지 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensureChannels() {
  if (Platform.OS !== 'android') return;
  for (const channel of Object.values(CHANNELS)) {
    await Notifications.setNotificationChannelAsync(channel.id, {
      name: channel.name,
      importance: channel.importance,
      // TODO(7.8): 상황별 알림음 파일을 채널마다 지정
      vibrationPattern: [0, 250, 250, 250],
    });
  }
}

/**
 * 푸시를 받을 준비를 하고 서버에 토큰을 등록합니다.
 * 권한을 거절하면 아무것도 하지 않습니다 (앱의 다른 기능은 그대로 동작).
 */
export async function registerForPush(): Promise<string | null> {
  // 에뮬레이터에는 푸시가 오지 않습니다
  if (!Device.isDevice) return null;

  try {
    await ensureChannels();

    const existing = await Notifications.getPermissionsAsync();
    const status =
      existing.status === 'granted' ? existing.status : (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return null;

    const token = (await Notifications.getDevicePushTokenAsync()).data;
    if (typeof token !== 'string' || !token) return null;

    if (isLive('auth')) await pushApi.register(token, Platform.OS);
    return token;
  } catch (error) {
    // 푸시를 못 받아도 앱은 계속 써야 합니다
    console.warn('[push] 등록 실패', String(error));
    return null;
  }
}

/** 로그아웃·기기 변경 때 서버에서 토큰을 지웁니다 (남의 기기로 알림이 가지 않게) */
export async function unregisterPush(): Promise<void> {
  try {
    const token = (await Notifications.getDevicePushTokenAsync()).data;
    if (typeof token === 'string' && token && isLive('auth')) await pushApi.unregister(token);
  } catch {
    // 이미 없으면 무시
  }
}
