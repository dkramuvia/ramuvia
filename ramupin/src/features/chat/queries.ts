import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { chatApi, type SendMessageInput } from '@/api/endpoints/chat';
import { mergeMessages, messageStore, roomStore } from '@/db/messages';
import { useAuthStore } from '@/stores/authStore';
import type { ChatMessage } from '@/types/models';

export const chatKeys = {
  rooms: ['chat', 'rooms'] as const,
  messages: (roomId: string) => ['chat', 'rooms', roomId, 'messages'] as const,
  readState: (roomId: string) => ['chat', 'rooms', roomId, 'read'] as const,
};

/**
 * 채팅방 목록 = 서버 방 + 기기에만 남은 방.
 * 그룹을 나가면 서버에서는 사라지지만 지난 대화는 내 폰에 남습니다 (WBS 7.6)
 */
export function useChatRooms() {
  return useQuery({
    queryKey: chatKeys.rooms,
    queryFn: async () => {
      const server = await chatApi.rooms();
      roomStore.save(server);
      const archived = roomStore.archived(server.map((r) => r.id));
      return [...server, ...archived].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
  });
}

export function useChatMessages(roomId: string) {
  const query = useQuery({
    queryKey: chatKeys.messages(roomId),
    // 기기에 있는 대화를 먼저 보여 주고 서버 것과 합칩니다 (WBS 7.6).
    // 서버에서 방이 사라졌거나 인터넷이 없어도 지난 대화가 보입니다
    queryFn: async () => {
      const local = messageStore.list(roomId);
      try {
        const server = await chatApi.messages(roomId);
        messageStore.save(server);
        return mergeMessages(local, server);
      } catch (error) {
        if (local.length > 0) return local;
        throw error;
      }
    },
    enabled: !!roomId,
    // 기기에 있는 것을 즉시 보여 주기 위해 처음 값으로 씀
    placeholderData: () => (roomId ? messageStore.list(roomId) : undefined),
  });
  const queryClient = useQueryClient();

  // 방을 열면 읽음 처리 (채팅방 목록의 안 읽은 수 0)
  useEffect(() => {
    if (!roomId || !query.isSuccess) return;
    chatApi
      .markRead(roomId)
      .then(() => queryClient.invalidateQueries({ queryKey: chatKeys.rooms, exact: true }))
      .catch(() => undefined);
  }, [roomId, query.isSuccess, queryClient]);

  return query;
}

/** 보내는 즉시 화면에 표시하고(전송 중), 서버 응답으로 교체합니다 */
export function useSendMessage(roomId: string) {
  const queryClient = useQueryClient();
  const myId = useAuthStore((s) => s.user?.id ?? '');
  const key = chatKeys.messages(roomId);

  return useMutation({
    mutationFn: (input: SendMessageInput) => chatApi.send(roomId, input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: key });
      const tempId = `temp-${Date.now()}`;
      const temp: ChatMessage = {
        id: tempId,
        roomId,
        senderId: myId,
        createdAt: new Date().toISOString(),
        pending: true,
        ...(input.type === 'text'
          ? { type: 'text', text: input.text }
          : input.type === 'photo'
            ? { type: 'photo', photo: { uri: input.localUri, width: input.width, height: input.height }, place: input.place }
            : { type: 'location', place: input.place }),
      };
      // 다시 보내기면 실패한 것을 지우고 새로 넣습니다
      queryClient.setQueryData<ChatMessage[]>(key, (list = []) => [...list.filter((m) => m.id !== retryOf.get(input)), temp]);
      retryOf.delete(input);
      return { tempId };
    },
    onSuccess: (message, _input, context) => {
      messageStore.save([message]);
      // 실시간(소켓)으로 같은 메시지가 **먼저** 들어와 있을 수 있습니다. 그때 임시 메시지를 바꿔 끼우면
      // 같은 메시지가 두 번 보입니다 (10-08 폰에서 확인). 이미 있으면 임시 메시지만 지웁니다
      queryClient.setQueryData<ChatMessage[]>(key, (list = []) =>
        list.some((m) => m.id === message.id)
          ? list.filter((m) => m.id !== context?.tempId)
          : list.map((m) => (m.id === context?.tempId ? message : m)),
      );
      queryClient.invalidateQueries({ queryKey: chatKeys.rooms, exact: true });
    },
    onError: (_error, input, context) => {
      // 지우지 않고 "전송 실패 · 눌러서 다시 보내기" 로 남깁니다 (보완 4.18). 보낼 내용은 따로 기억해 둡니다
      if (context?.tempId) failedInputs.set(context.tempId, input);
      queryClient.setQueryData<ChatMessage[]>(key, (list = []) => list.map((m) => (m.id === context?.tempId ? { ...m, pending: false, failed: true } : m)));
    },
  });
}

/** 실패한 메시지 id → 보내려던 내용 (다시 보내기용). 앱을 다시 켜면 사라집니다 */
const failedInputs = new Map<string, SendMessageInput>();
/** 다시 보낼 내용 → 지울 실패 메시지 id */
const retryOf = new Map<SendMessageInput, string>();

/** 실패한 메시지를 다시 보낼 내용. 없으면(앱을 다시 켬) null */
export function retryInput(messageId: string): SendMessageInput | null {
  const input = failedInputs.get(messageId);
  if (!input) return null;
  failedInputs.delete(messageId);
  retryOf.set(input, messageId);
  return input;
}

/** 방 사람들이 어디까지 읽었는지 (1:1 읽음 표시). 상대가 읽으면 소켓 'read' 로 바로 갱신됩니다 */
export function useReadState(roomId: string) {
  return useQuery({ queryKey: chatKeys.readState(roomId), queryFn: () => chatApi.readState(roomId), enabled: !!roomId });
}
