import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { friendsApi } from '@/api';
import type { FriendShareSetting } from '@/types/models';

export const friendKeys = {
  list: ['friends'] as const,
  requests: ['friends', 'requests'] as const,
  request: (requestId: string) => ['friends', 'requests', requestId] as const,
  shareSetting: (friendId: string) => ['friends', friendId, 'share-setting'] as const,
  nearby: ['friends', 'nearby'] as const,
};

export function useFriends() {
  return useQuery({ queryKey: friendKeys.list, queryFn: friendsApi.list });
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

export function useSendFriendRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: friendsApi.sendRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: friendKeys.requests, exact: true });
      queryClient.invalidateQueries({ queryKey: friendKeys.nearby });
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
    onSuccess: (_data, setting) => {
      queryClient.setQueryData(friendKeys.shareSetting(setting.friendId), setting);
      queryClient.invalidateQueries({ queryKey: friendKeys.list, exact: true });
    },
  });
}
