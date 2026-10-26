import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { groupsApi } from '@/api';
import i18n from '@/i18n';
import { showToast } from '@/utils/toast';

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

/**
 * 그룹 관리 (보완 4.19·4.20): 관리자 지정, 방장 넘기기, 내보내기, 그룹 설정, 그룹 삭제, 초대 링크.
 * 서버가 막은 이유(권한·방장 넘기기 먼저 등)는 문장으로 와서 화면에 그대로 띄웁니다.
 */
export function useGroupAdmin(groupId: string) {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: groupKeys.detail(groupId) });
    void queryClient.invalidateQueries({ queryKey: groupKeys.list, exact: true });
    void queryClient.invalidateQueries({ queryKey: chatRoomsKey });
  };
  const run = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSuccess: refresh,
    onError: (error) => {
      const message = (error as { response?: { data?: { message?: unknown } } }).response?.data?.message;
      showToast(typeof message === 'string' ? message : i18n.t('common.requestFailed'));
    },
  });
  return run;
}

export function useInviteLink(groupId: string) {
  return useQuery({ queryKey: [...groupKeys.detail(groupId), 'invite-link'], queryFn: () => groupsApi.currentInviteLink(groupId), enabled: !!groupId });
}
