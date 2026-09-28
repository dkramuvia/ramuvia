import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { friendsApi } from '@/api';
import { friendErrorCode, type FriendErrorCode } from '@/api/endpoints/friends';
import { isLive } from '@/config/env';
import i18n from '@/i18n';
import type { FriendShareSetting } from '@/types/models';
import { showToast } from '@/utils/toast';

export const friendKeys = {
  list: ['friends'] as const,
  requests: ['friends', 'requests'] as const,
  request: (requestId: string) => ['friends', 'requests', requestId] as const,
  shareSetting: (friendId: string) => ['friends', friendId, 'share-setting'] as const,
  nearby: ['friends', 'nearby'] as const,
  qrToken: ['friends', 'qr-token'] as const,
  alerts: (friendId: string) => ['friends', friendId, 'alerts'] as const,
};

/** 서버 연결 시 친구 위치를 주기적으로 다시 받음. TODO(실시간 단계): WebSocket 위치 수신으로 교체 */
const FRIENDS_REFETCH_MS = 30_000;

export function useFriends() {
  return useQuery({
    queryKey: friendKeys.list,
    queryFn: friendsApi.list,
    refetchInterval: isLive('friends') ? FRIENDS_REFETCH_MS : false,
  });
}

export function useFriendRequests() {
  return useQuery({ queryKey: friendKeys.requests, queryFn: friendsApi.requests });
}

export function useFriendRequest(requestId: string) {
  return useQuery({ queryKey: friendKeys.request(requestId), queryFn: () => friendsApi.getRequest(requestId) });
}

export function useRespondFriendRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, accept }: { requestId: string; accept: boolean }) => friendsApi.respond(requestId, accept),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: friendKeys.list, exact: true });
      queryClient.invalidateQueries({ queryKey: friendKeys.requests, exact: true });
    },
  });
}

export function useCancelFriendRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: friendsApi.cancelRequest,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: friendKeys.requests, exact: true }),
  });
}

const SEND_ERROR_KEYS: Partial<Record<FriendErrorCode, string>> = {
  ALREADY_FRIENDS: 'friendAdd.alreadyFriend',
  CANNOT_REQUEST_SELF: 'friendAdd.isMyself',
  USER_NOT_FOUND: 'friendAdd.userNotFound',
  REQUEST_LIMIT: 'friendAdd.requestLimit',
};

/** 친구 요청 보내기. 실패 이유는 토스트로 안내합니다 */
/**
 * 내 QR 에 넣을 일회용 토큰 (WBS 3.6).
 * 3분이면 만료되므로 화면이 떠 있는 동안 주기적으로 다시 받습니다.
 */
export function useFriendQrToken() {
  return useQuery({
    queryKey: friendKeys.qrToken,
    queryFn: friendsApi.qrToken,
    // 만료보다 넉넉히 짧게. 화면을 보다가 찍으려는 순간 만료되면 안 됩니다
    refetchInterval: QR_REFRESH_MS,
    refetchIntervalInBackground: false,
    staleTime: 0,
    gcTime: 0,
  });
}

/** 토큰 수명(3분)의 절반쯤에서 새로 받습니다 */
const QR_REFRESH_MS = 90_000;

/** 이 친구의 어떤 소식을 받을지 (피그마 2026-09-28) */
export function useFriendAlerts(friendId: string) {
  return useQuery({ queryKey: friendKeys.alerts(friendId), queryFn: () => friendsApi.alerts(friendId), enabled: !!friendId });
}

export function useSaveFriendAlerts(friendId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Parameters<typeof friendsApi.saveAlerts>[1]) => friendsApi.saveAlerts(friendId, patch),
    onSuccess: (saved) => queryClient.setQueryData(friendKeys.alerts(friendId), saved),
  });
}

export function useSendFriendRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    // QR 로 추가할 때는 토큰을 같이 넘깁니다 (요청이 만들어지면 서버가 그 토큰을 버립니다)
    mutationFn: ({ userId, qrToken }: { userId: string; qrToken?: string }) => friendsApi.sendRequest(userId, qrToken),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: friendKeys.requests, exact: true });
      queryClient.invalidateQueries({ queryKey: friendKeys.nearby });
      if (result.status === 'accepted') queryClient.invalidateQueries({ queryKey: friendKeys.list, exact: true });
    },
    onError: (error) => {
      const code = friendErrorCode(error);
      showToast(i18n.t((code && SEND_ERROR_KEYS[code]) ?? 'friendAdd.requestFailed'));
    },
  });
}

export function useNearbyUsers() {
  return useQuery({ queryKey: friendKeys.nearby, queryFn: friendsApi.nearby });
}

export function useShareSetting(friendId: string) {
  return useQuery({ queryKey: friendKeys.shareSetting(friendId), queryFn: () => friendsApi.getShareSetting(friendId) });
}

export function useSaveShareSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (setting: FriendShareSetting) => friendsApi.saveShareSetting(setting),
    onSuccess: (saved) => {
      queryClient.setQueryData(friendKeys.shareSetting(saved.friendId), saved);
      queryClient.invalidateQueries({ queryKey: friendKeys.list, exact: true });
    },
  });
}
