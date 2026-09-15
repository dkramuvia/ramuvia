import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { chatApi, type SendMessageInput } from '@/api/endpoints/chat';
import { useAuthStore } from '@/stores/authStore';
import type { ChatMessage } from '@/types/models';

export const chatKeys = {
  rooms: ['chat', 'rooms'] as const,
  messages: (roomId: string) => ['chat', 'rooms', roomId, 'messages'] as const,
};

export function useChatMessages(roomId: string) {
  return useQuery({ queryKey: chatKeys.messages(roomId), queryFn: () => chatApi.messages(roomId) });
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
        ...(input.type === 'text' ? { type: 'text', text: input.text } : { type: 'location', place: input.place }),
      };
      queryClient.setQueryData<ChatMessage[]>(key, (list = []) => [...list, temp]);
      return { tempId };
    },
    onSuccess: (message, _input, context) => {
      queryClient.setQueryData<ChatMessage[]>(key, (list = []) => list.map((m) => (m.id === context?.tempId ? message : m)));
      queryClient.invalidateQueries({ queryKey: chatKeys.rooms, exact: true });
    },
    onError: (_error, _input, context) => {
      // TODO: 실패 표시와 재전송 버튼
      queryClient.setQueryData<ChatMessage[]>(key, (list = []) => list.filter((m) => m.id !== context?.tempId));
    },
  });
}
