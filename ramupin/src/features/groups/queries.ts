import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { groupsApi } from '@/api';

export const groupKeys = {
  list: ['groups'] as const,
  detail: (groupId: string) => ['groups', groupId] as const,
};

export function useMyGroups() {
  return useQuery({ queryKey: groupKeys.list, queryFn: groupsApi.list });
}

const chatRoomsKey = ['chat', 'rooms'] as const;

export function useGroup(groupId: string) {
  return useQuery({ queryKey: groupKeys.detail(groupId), queryFn: () => groupsApi.get(groupId), enabled: !!groupId });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, memberIds }: { name: string; memberIds: string[] }) => groupsApi.create(name, memberIds),
    onSuccess: (group) => {
      queryClient.setQueryData(groupKeys.detail(group.id), group);
      queryClient.invalidateQueries({ queryKey: groupKeys.list, exact: true });
      queryClient.invalidateQueries({ queryKey: chatRoomsKey });
    },
  });
}

/** 친구와 1:1 대화방 열기 (없으면 만들어짐) */
export function useDirectRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (friendId: string) => groupsApi.directRoom(friendId),
    onSuccess: (group) => {
      queryClient.setQueryData(groupKeys.detail(group.id), group);
      queryClient.invalidateQueries({ queryKey: chatRoomsKey });
    },
  });
}

export function useRenameGroup(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => groupsApi.rename(groupId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupKeys.detail(groupId) });
      queryClient.invalidateQueries({ queryKey: chatRoomsKey });
    },
  });
}

export function useInviteToGroup(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberIds: string[]) => groupsApi.invite(groupId, memberIds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: groupKeys.detail(groupId) }),
  });
}

export function useLeaveGroup(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => groupsApi.leave(groupId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: groupKeys.detail(groupId) });
      queryClient.invalidateQueries({ queryKey: groupKeys.list, exact: true });
      queryClient.invalidateQueries({ queryKey: chatRoomsKey });
    },
  });
}
