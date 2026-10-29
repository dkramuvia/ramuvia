import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import * as Speech from 'expo-speech';
import { useEffect } from 'react';

import { inbox } from '@/db/inbox';
import { registerForPush } from './push';
import { selectIsSignedIn, useAuthStore } from '@/stores/authStore';
import { queryClient } from '@/api/queryClient';
import { friendKeys } from '@/features/friends/queries';
import type { HistoryCategory, HistoryEventType } from '@/types/models';

/**
 * 푸시 알림 연결 (WBS 6단계, 9.7).
 *
 * 하는 일 네 가지
 *   1. 로그인하면 이 기기의 푸시 토큰을 서버에 등록
 *   2. 알림을 받으면 기기 보관함에 저장 (앱을 지우기 전까지 남음)
 *   3. 알림을 누르면 해당 화면으로 이동
 *   4. 소리로 읽어 달라는 예약 메시지는 읽어 줌 (앱이 켜져 있을 때 받거나, 알림을 눌렀을 때)
 */
export function usePush() {
  const isSignedIn = useAuthStore(selectIsSignedIn);

  // 1) 토큰 등록. 로그인 상태가 되면 한 번
  useEffect(() => {
    if (!isSignedIn) return;
    void registerForPush();
  }, [isSignedIn]);

  // 2) 받은 알림을 보관함에 저장
  useEffect(() => {
    const received = Notifications.addNotificationReceivedListener((notification) => {
      saveToInbox(notification.request.content);
      speakIfAsked(notification.request);
    });
    return () => received.remove();
  }, []);

  // 3) 알림을 누르면 해당 화면으로
  useEffect(() => {
    const tapped = Notifications.addNotificationResponseReceivedListener((response) => {
      const content = response.notification.request.content;
      saveToInbox(content);
      speakIfAsked(response.notification.request);
      const route = (content.data as { route?: string } | undefined)?.route;
      // 서버가 보내 준 화면 주소. 없으면 알림 보관함(히스토리)으로
      if (typeof route === 'string' && route.startsWith('/')) router.push(route as never);
      else router.push('/settings/history');
    });
    return () => tapped.remove();
  }, []);
}

/** 이미 읽어 준 알림. 켜져 있을 때 받고 다시 눌러도 두 번 읽지 않습니다 */
const spoken = new Set<string>();

/** 예약 메시지에 "소리로 읽기"가 켜져 있으면 제목과 내용을 읽어 줍니다 (서버 scheduled-sender 의 data.tts) */
function speakIfAsked(request: Notifications.NotificationRequest) {
  const { title, body, data } = request.content;
  const d = (data ?? {}) as { kind?: string; tts?: string };
  if (d.kind !== 'scheduledMessage' || d.tts !== '1' || spoken.has(request.identifier)) return;
  spoken.add(request.identifier);
  Speech.speak([title, body].filter(Boolean).join('. '), { language: 'ko-KR' });
}

type PushData = { kind?: string; track?: string; route?: string; id?: string; sosId?: string; status?: string };

const ANOMALY_TYPES: Record<string, HistoryEventType> = { battery: 'batteryLow', no_signal: 'gpsLost' };

/**
 * 푸시 종류로 히스토리 칸을 정합니다. 예전에는 모든 푸시를 '긴급/안전'으로 넣어
 * 채팅·친구 요청·예약 메시지까지 섞였습니다 (대표 리포트 55·75).
 * 채팅은 대화방에 남으므로 보관하지 않습니다.
 */
function classify(data: PushData): { type: HistoryEventType; category: HistoryCategory } | null {
  if (data.kind === 'chat') return null;
  if (data.sosId) return { type: 'sos', category: 'safety' };
  if (data.track) return { type: ANOMALY_TYPES[data.track] ?? 'noMovement', category: 'safety' };
  if (data.kind === 'speeding' || data.kind === 'speedingFriend') return { type: 'speeding', category: 'safety' };
  if (data.kind === 'dangerZone') return { type: 'dangerZone', category: 'safety' };
  if (data.kind === 'enter') return { type: 'geofenceArrive', category: 'safety' };
  if (data.kind === 'leave') return { type: 'geofenceLeave', category: 'safety' };
  if (data.kind === 'friendRequest') return { type: 'friendRequest', category: 'place' };
  return { type: 'notice', category: 'place' };
}

/** 같은 알림을 두 번 받아도(수신 + 누름) 한 번만 남습니다 (id 기준) */
function saveToInbox(content: Notifications.NotificationContent) {
  const data = (content.data ?? {}) as PushData;
  if (data.kind === 'friendRequest') queryClient.invalidateQueries({ queryKey: friendKeys.list });
  const kind = classify(data);
  if (!kind) return;
  // 제목이 앱 이름이 아니면(예약 메시지 제목·SOS 보낸 사람 등) 누가/무엇인지 보이게 함께 남깁니다
  const title = content.title && content.title !== '라무핀' ? content.title : '';
  const body = content.body ?? '';
  const message = title && !body.includes(title) ? `${title} · ${body}` : body || title;
  try {
    inbox.add({
      id: data.id ?? `push-${content.title ?? ''}-${content.body ?? ''}`,
      type: kind.type,
      category: kind.category,
      message,
      createdAt: new Date().toISOString(),
      payload: data,
    });
    queryClient.invalidateQueries({ queryKey: ['history'] });
  } catch (error) {
    console.warn('[push] 보관함 저장 실패', String(error));
  }
}
