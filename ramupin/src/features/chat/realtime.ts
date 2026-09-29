import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';

import { toChatMessage } from '@/api/endpoints/chat';
import { queryClient } from '@/api/queryClient';
import { env, isLive } from '@/config/env';
import { endSession, refreshAccessToken } from '@/features/auth/session';
import { chatKeys } from '@/features/chat/queries';
import { messageStore } from '@/db/messages';
import { setWatchMode } from '@/features/location/watchMode';
import { friendKeys } from '@/features/friends/queries';
import { groupKeys } from '@/features/groups/queries';
import { useAlertStore } from '@/features/alerts/alertStore';
import { useAuthStore } from '@/stores/authStore';
import type { ChatMessage } from '@/types/models';

/**
 * 실시간 연결 (WBS 7.5).
 * 로그인 상태면 서버에 붙어서 새 메시지를 바로 받습니다. 앱이 꺼져 있을 때는 푸시 알림(다음 단계).
 */
let socket: Socket | null = null;

interface ServerSos {
  nickname: string;
  latitude: number | null;
  longitude: number | null;
  placeName: string | null;
  placeAddress: string | null;
  startedAt: string;
  status?: 'sent' | 'cancelled';
  hasAudio?: boolean;
}

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
  // 누가 내 지도를 보기 시작/그만두면 서버가 알려 줍니다 (GPS 보고서 2-1 6번)
  socket.on('watch-mode', ({ on }: { on: boolean }) => {
    void setWatchMode(on);
  });

  // 내가 보고 있는 친구의 위치가 갱신될 때마다 바로 받습니다.
  // 30초 주기 재조회(FRIENDS_REFETCH_MS)는 소켓이 끊겼을 때를 위한 대비로 남겨 둡니다
  socket.on('friend-location', () => {
    queryClient.invalidateQueries({ queryKey: friendKeys.list, exact: true });
  });

  // 친구가 SOS 를 눌렀을 때 (WBS 7.9). 누구에게 보낼지는 서버가 정합니다
  socket.on('sos', (payload: ServerSos) => {
    queryClient.invalidateQueries({ queryKey: ['sos', 'received'] });
    // 취소 알림은 팝업을 띄우지 않습니다 — 이미 지나간 일이라 놀라게만 합니다
    if (payload.status === 'cancelled') return;
    useAlertStore.getState().showPopup({
      kind: 'sos',
      name: payload.nickname,
      place: {
        placeName: payload.placeName ?? undefined,
        address: payload.placeAddress ?? '',
        latitude: payload.latitude ?? 0,
        longitude: payload.longitude ?? 0,
      },
      sentAt: payload.startedAt,
      hasVoice: payload.hasAudio ?? false,
    });
  });

  // 친구가 안심장소를 드나들면 (WBS 9.4). 받을 사람은 서버가 정합니다
  socket.on('geofence', ({ nickname, zoneName, kind }: { nickname: string; zoneName: string; kind: 'enter' | 'leave' }) => {
    useAlertStore.getState().pushCard({ kind: kind === 'enter' ? 'arrive' : 'leave', name: nickname, place: zoneName });
  });

  /**
   * 과속 경고 (WBS 8.1). 두 가지가 같은 통로로 옵니다.
   *   - `speeding`       : **내가** 과속 중 → 운전 중이라 즉시 팝업
   *   - `speedingFriend` : **친구가** 과속 중 → 놀라지 않게 카드로만
   */
  socket.on('speeding', (payload: { kind: 'speeding' | 'speedingFriend'; speedKmh: number; nickname?: string }) => {
    if (payload.kind === 'speedingFriend') {
      useAlertStore.getState().pushCard({ kind: 'speeding', name: payload.nickname ?? '', speedKmh: Math.round(payload.speedKmh) });
      return;
    }
    useAlertStore.getState().showPopup({ kind: 'speeding', speedKmh: Math.round(payload.speedKmh) });
  });

  /**
   * 위험지역에 들어갔을 때 (WBS 9.6).
   * 지금 그곳에 있는 본인에게 오는 알림이라 바로 팝업으로 띄웁니다.
   */
  socket.on('danger-zone', (payload: { zoneName: string; place: { latitude: number; longitude: number } }) => {
    useAlertStore.getState().showPopup({
      kind: 'dangerZone',
      zoneName: payload.zoneName,
      place: { latitude: payload.place.latitude, longitude: payload.place.longitude, address: '' },
    });
  });

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

/**
 * "지금 이 친구들 지도를 보고 있다"를 서버에 알립니다 (GPS 보고서 2-1 6번).
 * 서버가 그 친구들 폰에만 촘촘한 수집을 켜라고 알리고, 화면을 닫으면 되돌립니다.
 */
export function watchFriends(userIds: string[]) {
  socket?.emit('watch', { userIds });
}

export function unwatchFriends() {
  socket?.emit('unwatch');
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
