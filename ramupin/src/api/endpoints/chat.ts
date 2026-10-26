import * as FileSystem from 'expo-file-system/legacy';

import { apiClient, mockResponse } from '../client';
import { mockChatRooms, mockMe, mockMessages } from '../mock/data';
import { isLive } from '@/config/env';
import type { ChatMessage, ChatRoom, SharedPlace } from '@/types/models';

export type SendMessageInput =
  | { type: 'text'; text: string }
  | { type: 'location'; place: SharedPlace }
  /** 사진: 폰 안의 파일. 보낼 때 저장소에 먼저 올립니다. place = 위치 포함을 골랐을 때만 (보완 4.18) */
  | { type: 'photo'; localUri: string; width: number | null; height: number | null; place?: SharedPlace };

/** 서버 응답 (시스템 메시지는 보낸 사람이 없음) */
interface ChatMessageResponse {
  id: string;
  roomId: string;
  senderId: string | null;
  type: ChatMessage['type'];
  text?: string;
  place?: SharedPlace;
  photo?: { uri: string; width: number | null; height: number | null };
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
        ...(input.type === 'text'
          ? { type: 'text', text: input.text }
          : input.type === 'photo'
            ? { type: 'photo', photo: { uri: input.localUri, width: input.width, height: input.height }, place: input.place }
            : { type: 'location', place: input.place }),
      };
      (mockMessages[roomId] ??= []).push(message);
      const room = mockChatRooms.find((r) => r.id === roomId);
      if (room) {
        room.lastMessage = input.type === 'text' ? input.text : input.type === 'photo' ? '사진을 보냈어요.' : '위치를 공유했어요.';
        room.updatedAt = message.createdAt;
      }
      return mockResponse(message, 150);
    }
    const body = input.type === 'photo' ? { type: 'photo', assetId: await uploadPhoto(input.localUri), place: input.place ?? null } : input;
    const { data } = await apiClient.post<ChatMessageResponse>(`/chat/rooms/${roomId}/messages`, body);
    return toChatMessage(data);
  },

  /** 방 사람들이 어디까지 읽었는지 (1:1 "읽음" 표시) */
  async readState(roomId: string): Promise<{ userId: string; lastReadAt: string | null }[]> {
    if (!isLive('chat')) return mockResponse([]);
    const { data } = await apiClient.get<{ userId: string; lastReadAt: string | null }[]>(`/chat/rooms/${roomId}/read-state`);
    return data;
  },

  /** 방을 열었을 때: 안 읽은 수 0으로 */
  async markRead(roomId: string): Promise<void> {
    if (!isLive('chat')) return mockResponse(undefined, 0);
    await apiClient.post(`/chat/rooms/${roomId}/read`);
  },
};

/**
 * 채팅 사진을 갤러리와 같은 저장소에 올리고 그 id 를 돌려줍니다.
 * 사진 공유 용량이 모자라면 여기서 거절됩니다 (서버가 등급 용량을 봅니다).
 */
async function uploadPhoto(uri: string): Promise<string> {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) throw new Error('사진 파일이 없습니다');
  const { data } = await apiClient.post<{ targets: { assetId: string; uploadUrl: string; contentType: string }[] }>('/gallery/upload-targets', {
    files: [{ contentType: 'image/jpeg', bytes: info.size }],
  });
  const target = data.targets[0];
  const result = await FileSystem.uploadAsync(target.uploadUrl, uri, {
    httpMethod: 'PUT',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { 'Content-Type': target.contentType },
  });
  if (result.status < 200 || result.status >= 300) throw new Error(`사진 업로드 실패 (${result.status})`);
  return target.assetId;
}
