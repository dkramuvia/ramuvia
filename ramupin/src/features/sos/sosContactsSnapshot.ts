import Storage from 'expo-sqlite/kv-store';
import { Linking, Platform } from 'react-native';

import type { SosContact } from '@/types/models';

/**
 * 인터넷이 끊겼을 때 쓸 비회원 연락처 사본 (수정 반영본 C1·C9).
 *
 * SOS 문자는 서버가 알리고로 보냅니다. 그런데 폰 인터넷이 끊기면 서버에 닿지 못하므로,
 * 그때만 앱이 문자 창을 열어 사용자가 [보내기]를 누르게 합니다. 그 순간에는 서버에서
 * 연락처를 받아올 수도 없어서, 안전 설정을 받을 때마다 기기에 적어 둡니다.
 */

const KEY = 'sos-contacts-snapshot';

export async function saveSosContactsSnapshot(contacts: SosContact[], smsEnabled: boolean): Promise<void> {
  try {
    await Storage.setItem(KEY, JSON.stringify(smsEnabled ? contacts.map((c) => ({ name: c.name, phone: c.phone })) : []));
  } catch (error) {
    console.warn('[sos] 연락처 사본 저장 실패', String(error));
  }
}

async function loadSnapshot(): Promise<{ name: string; phone: string }[]> {
  try {
    const raw = await Storage.getItem(KEY);
    return raw ? (JSON.parse(raw) as { name: string; phone: string }[]) : [];
  } catch {
    return [];
  }
}

/**
 * 문자 창을 엽니다. 받는 사람과 본문(위치 링크)이 채워져 있고, 사용자가 [보내기]만 누르면 됩니다.
 * 연락처가 없으면 false.
 */
export async function openOfflineSosSms(nickname: string, coords: { latitude: number; longitude: number } | null): Promise<boolean> {
  const contacts = await loadSnapshot();
  if (contacts.length === 0) return false;
  const lines = [`[라무핀 SOS] ${nickname}님이 긴급 도움을 요청했어요.`];
  lines.push(
    coords
      ? `위치: https://www.google.com/maps/search/?api=1&query=${coords.latitude.toFixed(6)},${coords.longitude.toFixed(6)}`
      : '위치를 확인하지 못했어요. 전화로 확인해 주세요.',
  );
  const to = contacts.map((c) => c.phone).join(Platform.OS === 'ios' ? ',' : ';');
  // iOS 는 &body, Android 는 ?body 를 읽습니다
  const url = `sms:${to}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(lines.join('\n'))}`;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
