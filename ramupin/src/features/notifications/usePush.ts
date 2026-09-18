import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';

import { inbox } from '@/db/inbox';
import { registerForPush } from './push';
import { selectIsSignedIn, useAuthStore } from '@/stores/authStore';
import { queryClient } from '@/api/queryClient';

/**
 * 푸시 알림 연결 (WBS 6단계, 9.7).
 *
 * 하는 일 세 가지
 *   1. 로그인하면 이 기기의 푸시 토큰을 서버에 등록
 *   2. 알림을 받으면 기기 보관함에 저장 (앱을 지우기 전까지 남음)
 *   3. 알림을 누르면 해당 화면으로 이동
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
    });
    return () => received.remove();
  }, []);

  // 3) 알림을 누르면 해당 화면으로
  useEffect(() => {
    const tapped = Notifications.addNotificationResponseReceivedListener((response) => {
      const content = response.notification.request.content;
      saveToInbox(content);
      const route = (content.data as { route?: string } | undefined)?.route;
      // 서버가 보내 준 화면 주소. 없으면 알림 보관함(히스토리)으로
      if (typeof route === 'string' && route.startsWith('/')) router.push(route as never);
      else router.push('/settings/history');
    });
    return () => tapped.remove();
  }, []);
}

/** 같은 알림을 두 번 받아도(수신 + 누름) 한 번만 남습니다 (id 기준) */
function saveToInbox(content: Notifications.NotificationContent) {
  const data = (content.data ?? {}) as { track?: string; route?: string; id?: string };
  try {
    inbox.add({
      id: data.id ?? `push-${content.title ?? ''}-${content.body ?? ''}`,
      // 서버가 track 을 보내면 그대로, 아니면 일반 알림
      type: (data.track ?? 'noMovement') as never,
      category: 'safety',
      message: content.body ?? content.title ?? '',
      createdAt: new Date().toISOString(),
      payload: data,
    });
    queryClient.invalidateQueries({ queryKey: ['history'] });
  } catch (error) {
    console.warn('[push] 보관함 저장 실패', String(error));
  }
}
