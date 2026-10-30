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

/**
 * 상황별 알림 채널. 알람마다 소리가 다릅니다 (요금제 안내 10-30, 4-1 알람별 알림음).
 * id·소리는 서버 push.service 의 ANDROID_CHANNEL 과 같아야 합니다.
 * 안드로이드는 한 번 만든 채널의 소리를 바꿀 수 없어, 소리를 붙이면서 id 를 새로 정했습니다
 */
export const CHANNELS = {
  sos: { id: 'sos_alarm', name: 'SOS 긴급', importance: Notifications.AndroidImportance.MAX, sound: 'sos_alarm.wav' },
  danger: { id: 'danger_alarm', name: '위험 지역', importance: Notifications.AndroidImportance.HIGH, sound: 'danger_zone_alarm.wav' },
  anomaly: { id: 'anomaly_alarm', name: '이상 동작', importance: Notifications.AndroidImportance.HIGH, sound: 'anomaly_alarm.wav' },
  battery: { id: 'battery_alarm', name: '배터리 부족', importance: Notifications.AndroidImportance.HIGH, sound: 'battery_alarm.wav' },
  longStay: { id: 'long_stay_alarm', name: '장시간 위치 고정', importance: Notifications.AndroidImportance.HIGH, sound: 'long_stay_alarm.wav' },
  safeZone: { id: 'safe_zone_alarm', name: '안심지역', importance: Notifications.AndroidImportance.HIGH, sound: 'safe_zone_alarm.wav' },
  geofence: { id: 'geofence_alarm', name: '지오펜스', importance: Notifications.AndroidImportance.HIGH, sound: 'geofence_alarm.wav' },
  scheduled: { id: 'scheduled_alarm', name: '예약 메시지', importance: Notifications.AndroidImportance.HIGH, sound: 'scheduled_alarm.wav' },
  general: { id: 'general', name: '일반 알림', importance: Notifications.AndroidImportance.DEFAULT, sound: undefined },
  // 채팅은 따로 둡니다. 사용자가 휴대폰 설정에서 채팅만 끌 수 있게 (서버 PushChannel 'chat')
  chat: { id: 'chat', name: '채팅', importance: Notifications.AndroidImportance.HIGH, sound: undefined },
} as const;

/** 소리 없이 만들었던 옛 채널. 남겨 두면 휴대폰 알림 설정에 빈 항목이 남습니다 */
const OLD_CHANNEL_IDS = ['sos', 'danger', 'anomaly'];

/** 앱이 켜져 있을 때 알림이 오면 어떻게 보여줄지 */
Notifications.setNotificationHandler({
  // 앱을 보고 있을 때 온 채팅 알림은 띄우지 않습니다 — 화면에 이미 실시간으로 들어옵니다
  handleNotification: async (notification) => ({
    shouldShowBanner: notification.request.content.data?.kind !== 'chat',
    shouldShowList: notification.request.content.data?.kind !== 'chat',
    shouldPlaySound: notification.request.content.data?.kind !== 'chat',
    shouldSetBadge: false,
  }),
});

async function ensureChannels() {
  if (Platform.OS !== 'android') return;
  for (const channel of Object.values(CHANNELS)) {
    await Notifications.setNotificationChannelAsync(channel.id, {
      name: channel.name,
      importance: channel.importance,
      // 소리 없는 채널은 휴대폰 기본 알림음
      ...(channel.sound ? { sound: channel.sound } : {}),
      vibrationPattern: [0, 250, 250, 250],
    });
  }
  for (const id of OLD_CHANNEL_IDS) {
    await Notifications.deleteNotificationChannelAsync(id).catch(() => undefined);
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
