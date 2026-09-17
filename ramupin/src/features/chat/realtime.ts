import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';

import { toChatMessage } from '@/api/endpoints/chat';
import { queryClient } from '@/api/queryClient';
import { env, isLive } from '@/config/env';
import { endSession, refreshAccessToken } from '@/features/auth/session';
import { chatKeys } from '@/features/chat/queries';
import { messageStore } from '@/db/messages';
import { groupKeys } from '@/features/groups/queries';
import { useAuthStore } from '@/stores/authStore';
import type { ChatMessage } from '@/types/models';

/**
 * 실시간 연결 (WBS 7.5).
 * 로그인 상태면 서버에 붙어서 새 메시지를 바로 받습니다. 앱이 꺼져 있을 때는 푸시 알림(다음 단계).
 * TODO(6단계): 친구 위치·긴급 알림도 이 연결로 받기
 */
let socket: Socket | null = null;

interface ServerMessage {
  id: string;
  roomId: string;
  senderId: string | null;
  type: ChatMessage['type'];
  text?: string;
  place?: ChatMessage['place'];
  createdAt: string;
}

function addMessage(message: ChatMessage) {
  // 받은 즉시 기기에도 저장 (WBS 7.6: 방이 삭제돼도 내 폰에는 남음)
  try {
    messageStore.save([message]);
  } catch (error) {
    console.warn('[chat] 기기 저장 실패', String(error));
  }
  queryClient.setQueryData<ChatMessage[]>(chatKeys.messages(message.roomId), (list = []) =>
    list.some((m) => m.id === message.id) ? list : [...list, message],
  );
  queryClient.invalidateQueries({ queryKey: chatKeys.rooms, exact: true });
}

function connect(token: string) {
  socket?.close();
  socket = io(env.wsUrl, { path: '/ws', transports: ['websocket'], auth: { token }, reconnectionDelayMax: 10_000 });

  socket.on('connect_error', (error) => __DEV__ && console.log('[realtime] 연결 오류', String(error)));
  socket.on('message', (payload: ServerMessage) => addMessage(toChatMessage(payload)));
  socket.on('rooms-changed', () => {
    queryClient.invalidateQueries({ queryKey: chatKeys.rooms, exact: true });
    queryClient.invalidateQueries({ queryKey: groupKeys.list, exact: true });
  });

  socket.on('auth-error', async ({ code }: { code: string }) => {
    if (code === 'TOKEN_INVALID') {
      // access token 이 만료된 경우: 갱신 후 다시 연결
      const fresh = await refreshAccessToken();
      if (fresh) connect(fresh);
      return;
    }
    if (code === 'SESSION_REPLACED') await endSession('replaced');
    else if (code === 'SESSION_REVOKED') await endSession('revoked');
  });
}

export function disconnectRealtime() {
  socket?.close();
  socket = null;
}

/** 루트 레이아웃에서 한 번 호출 */
export function useRealtime() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const enabled = isLive('chat') && !!accessToken && accessToken !== 'dev-token';

  useEffect(() => {
    if (!enabled || !accessToken) {
      disconnectRealtime();
      return;
    }
    connect(accessToken);
    return () => disconnectRealtime();
  }, [enabled, accessToken]);
}
