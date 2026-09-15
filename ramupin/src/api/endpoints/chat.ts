import { apiClient, mockResponse } from '../client';
import { mockChatRooms, mockMe, mockMessages } from '../mock/data';
import { env } from '@/config/env';
import type { ChatMessage, ChatRoom, SharedPlace } from '@/types/models';

export type SendMessageInput = { type: 'text'; text: string } | { type: 'location'; place: SharedPlace };

/**
 * TODO(5단계): 새 메시지 수신은 WebSocket 으로. 여기 REST 는 이전 대화 불러오기와 전송 확인용
 * WBS 7.6: 채팅방을 삭제하면 서버 대화는 삭제되고 기기(로컬 DB)에는 남습니다.
 */
export const chatApi = {
  async rooms(): Promise<ChatRoom[]> {
    if (env.useMock) return mockResponse(mockChatRooms);
    const { data } = await apiClient.get<ChatRoom[]>('/chat/rooms');
    return data;
  },

  /** 최신 메시지가 배열 끝 */
  async messages(roomId: string): Promise<ChatMessage[]> {
    if (env.useMock) {
      if (!mockMessages[roomId]) {
        mockMessages[roomId] = [
          { id: `sys-${roomId}`, roomId, senderId: mockMe.id, type: 'system', text: '그룹채팅을 만들었습니다.', createdAt: new Date().toISOString() },
        ];
      }
      return mockResponse([...mockMessages[roomId]]);
    }
    const { data } = await apiClient.get<ChatMessage[]>(`/chat/rooms/${roomId}/messages`);
    return data;
  },

  async send(roomId: string, input: SendMessageInput): Promise<ChatMessage> {
    if (env.useMock) {
      const message: ChatMessage = {
        id: `m${Date.now()}`,
        roomId,
        senderId: mockMe.id,
        createdAt: new Date().toISOString(),
        ...(input.type === 'text' ? { type: 'text', text: input.text } : { type: 'location', place: input.place }),
      };
      (mockMessages[roomId] ??= []).push(message);
      const room = mockChatRooms.find((r) => r.id === roomId);
      if (room) {
        room.lastMessage = input.type === 'text' ? input.text : '위치를 공유했어요.';
        room.updatedAt = message.createdAt;
      }
      return mockResponse(message, 150);
    }
    const { data } = await apiClient.post<ChatMessage>(`/chat/rooms/${roomId}/messages`, input);
    return data;
  },
};
