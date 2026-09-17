import { getDb } from './index';
import type { ChatMessage, ChatMessageType, ChatRoom, SharedPlace } from '@/types/models';

/**
 * 채팅 메시지 기기 보관 (WBS 7.6: 방을 삭제하면 서버에서는 지워지지만 내 폰에는 남습니다).
 *
 * 화면은 항상 기기에 있는 것을 먼저 보여 주고, 서버에서 받은 것을 합칩니다.
 * 그래서 인터넷이 없어도 지난 대화를 볼 수 있습니다.
 * TODO(12.4): 기기를 바꿀 때 이 내용을 옮기는 기능
 */

interface MessageRow {
  id: string;
  room_id: string;
  sender_id: string;
  type: string;
  /** 글이면 글 내용, 위치면 장소 JSON */
  body: string;
  created_at: string;
}

const toMessage = (row: MessageRow): ChatMessage => {
  const type = row.type as ChatMessageType;
  return {
    id: row.id,
    roomId: row.room_id,
    senderId: row.sender_id,
    type,
    createdAt: row.created_at,
    ...(type === 'location' ? { place: JSON.parse(row.body) as SharedPlace } : { text: row.body }),
  };
};

const bodyOf = (message: ChatMessage) => (message.type === 'location' ? JSON.stringify(message.place ?? null) : (message.text ?? ''));

export const messageStore = {
  /** 서버에서 받은 메시지를 기기에 저장 (같은 id 는 덮어씀). 전송 중인 것은 저장하지 않습니다 */
  save(messages: ChatMessage[]): void {
    const saved = messages.filter((m) => !m.pending);
    if (saved.length === 0) return;
    const db = getDb();
    db.withTransactionSync(() => {
      for (const m of saved) {
        db.runSync(
          'INSERT OR REPLACE INTO chat_messages (id, room_id, sender_id, type, body, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          m.id,
          m.roomId,
          m.senderId,
          m.type,
          bodyOf(m),
          m.createdAt,
        );
      }
    });
  },

  /** 기기에 있는 방의 메시지 (오래된 것부터) */
  list(roomId: string, limit = 500): ChatMessage[] {
    const rows = getDb().getAllSync<MessageRow>(
      'SELECT * FROM (SELECT * FROM chat_messages WHERE room_id = ? ORDER BY created_at DESC LIMIT ?) ORDER BY created_at',
      roomId,
      limit,
    );
    return rows.map(toMessage);
  },

  /** 기기에 저장된 메시지가 있는 방 (서버에서 사라진 방을 찾을 때) */
  roomIds(): string[] {
    return getDb()
      .getAllSync<{ room_id: string }>('SELECT DISTINCT room_id FROM chat_messages')
      .map((r) => r.room_id);
  },

  /** 방의 마지막 메시지 (서버에서 사라진 방의 목록 줄에 표시) */
  lastMessage(roomId: string): ChatMessage | null {
    const row = getDb().getFirstSync<MessageRow>('SELECT * FROM chat_messages WHERE room_id = ? ORDER BY created_at DESC LIMIT 1', roomId);
    return row ? toMessage(row) : null;
  },

  /** 기기에서도 지우기 (사용자가 직접 지울 때만) */
  remove(roomId: string): void {
    getDb().runSync('DELETE FROM chat_messages WHERE room_id = ?', roomId);
  },
};

/**
 * 기기에 있는 메시지와 서버에서 받은 메시지를 합칩니다.
 * 같은 id 는 서버 것이 이깁니다 (내용이 바뀌었을 수 있음).
 */
export function mergeMessages(local: ChatMessage[], server: ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const m of local) byId.set(m.id, m);
  for (const m of server) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

interface RoomRow {
  id: string;
  name: string;
  member_count: number;
  updated_at: string;
}

/**
 * 방 정보 기기 보관.
 * 그룹을 나가면 서버에서 방이 사라지지만, 기기에 남은 대화를 보여 주려면 방 이름이 필요합니다.
 */
export const roomStore = {
  save(rooms: { id: string; name: string; memberCount: number; updatedAt: string }[]): void {
    if (rooms.length === 0) return;
    const db = getDb();
    db.withTransactionSync(() => {
      for (const r of rooms) {
        db.runSync(
          'INSERT OR REPLACE INTO chat_rooms (id, name, member_count, updated_at) VALUES (?, ?, ?, ?)',
          r.id,
          r.name,
          r.memberCount,
          r.updatedAt,
        );
      }
    });
  },

  /** 서버 목록에 없는 방 = 나갔거나 해지된 방. 대화가 남아 있는 것만 돌려줍니다 */
  archived(serverRoomIds: string[]): ChatRoom[] {
    const rows = getDb().getAllSync<RoomRow>('SELECT * FROM chat_rooms ORDER BY updated_at DESC');
    const alive = new Set(serverRoomIds);
    const archived: ChatRoom[] = [];
    for (const r of rows) {
      if (alive.has(r.id)) continue;
      const last = messageStore.lastMessage(r.id);
      // 대화가 하나도 안 남은 방은 보여 줄 것이 없습니다
      if (!last) continue;
      archived.push({
        id: r.id,
        name: r.name,
        memberCount: r.member_count,
        lastMessage: last.type === 'location' ? (last.place?.placeName ?? last.place?.address) : last.text,
        updatedAt: last.createdAt,
        archived: true,
      });
    }
    return archived;
  },

  remove(roomId: string): void {
    getDb().runSync('DELETE FROM chat_rooms WHERE id = ?', roomId);
  },
};
