import { apiClient, mockResponse } from '../client';
import { mockChatRooms, mockMe, mockMessages } from '../mock/data';
import { isLive } from '@/config/env';
import type { ChatMessage, ChatRoom, SharedPlace } from '@/types/models';

export type SendMessageInput = { type: 'text'; text: string } | { type: 'location'; place: SharedPlace };

/** 서버 응답 (시스템 메시지는 보낸 사람이 없음) */
interface ChatMessageResponse {
  id: string;
  roomId: string;
  senderId: string | null;
  type: ChatMessage['type'];
  text?: string;
  place?: SharedPlace;
  createdAt: string;
}

export function toChatMessage(m: ChatMessageResponse): ChatMessage {
  return { ...m, senderId: m.senderId ?? '' };
}

/**
 * 채팅. 새 메시지 수신은 WebSocket(features/chat/realtime.ts), 여기 REST 는 지난 대화와 전송입니다.
 * WBS 7.6: 채팅방을 삭제하면 서버 대화는 삭제되고 기기(로컬 DB)에는 남습니다.
 */
export const chatApi = {
  async rooms(): Promise<ChatRoom[]> {
    if (!isLive('chat')) return mockResponse(mockChatRooms);
    const { data } = await apiClient.get<ChatRoom[]>('/chat/rooms');
    return data;
  },

  /** 최신 메시지가 배열 끝. before 를 주면 그보다 이전 대화 */
  async messages(roomId: string, before?: string): Promise<ChatMessage[]> {
    if (!isLive('chat')) {
      if (!mockMessages[roomId]) {
        mockMessages[roomId] = [
          { id: `sys-${roomId}`, roomId, senderId: mockMe.id, type: 'system', text: '그룹채팅을 만들었습니다.', createdAt: new Date().toISOString() },
        ];
      }
      return mockResponse([...mockMessages[roomId]]);
    }
    const { data } = await apiClient.get<ChatMessageResponse[]>(`/chat/rooms/${roomId}/messages`, { params: before ? { before } : undefined });
    return data.map(toChatMessage);
  },

  async send(roomId: string, input: SendMessageInput): Promise<ChatMessage> {
    if (!isLive('chat')) {
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
    const { data } = await apiClient.post<ChatMessageResponse>(`/chat/rooms/${roomId}/messages`, input);
    return toChatMessage(data);
  },

  /** 방을 열었을 때: 안 읽은 수 0으로 */
  async markRead(roomId: string): Promise<void> {
    if (!isLive('chat')) return mockResponse(undefined, 0);
    await apiClient.post(`/chat/rooms/${roomId}/read`);
  },
};
