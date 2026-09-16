import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';

import { appError } from '../common/app-error.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import type { SharedPlace } from '../database/main.schema.js';
import { GroupsService } from '../groups/groups.service.js';

export const sendMessageBody = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string().min(1).max(1000) }),
  z.object({
    type: z.literal('location'),
    place: z.object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      address: z.string().max(200),
      placeName: z.string().max(100).optional(),
    }),
  }),
]);

export type SendMessageInput = z.infer<typeof sendMessageBody>;

/** 앱 src/types/models.ts 의 ChatMessage */
export interface ChatMessageResponse {
  id: string;
  roomId: string;
  senderId: string | null;
  type: 'text' | 'location' | 'system';
  text?: string;
  place?: SharedPlace;
  createdAt: string;
}

/** 앱 src/types/models.ts 의 ChatRoom */
export interface ChatRoomResponse {
  id: string;
  name: string;
  memberCount: number;
  lastMessage?: string;
  updatedAt: string;
  unreadCount: number;
}

const PAGE_SIZE = 50;

/**
 * 채팅 (WBS 7.5, 7.6).
 * 저장은 서버, 전달은 WebSocket(ChatGateway). 기기에도 따로 보관해서 방이 삭제돼도 남습니다.
 */
@Injectable()
export class ChatService {
  constructor(
    @Inject(MAIN_DB) private readonly db: MainDb,
    private readonly groups: GroupsService,
  ) {}

  /** 채팅방 목록 (마지막 메시지와 안 읽은 수) */
  async rooms(me: string): Promise<ChatRoomResponse[]> {
    const rows = await this.db
      .selectFrom('social.group_members as gm')
      .innerJoin('social.groups as g', 'g.id', 'gm.group_id')
      .select((eb) => [
        'g.id',
        'g.name',
        'g.is_direct',
        'g.updated_at',
        'gm.last_read_at',
        eb
          .selectFrom('social.group_members as m')
          .select((e) => e.fn.countAll<string>().as('c'))
          .whereRef('m.group_id', '=', 'g.id')
          .as('member_count'),
        eb
          .selectFrom('chat.messages as msg')
          .select('msg.text')
          .whereRef('msg.room_id', '=', 'g.id')
          .orderBy('msg.created_at', 'desc')
          .limit(1)
          .as('last_text'),
        eb
          .selectFrom('chat.messages as msg2')
          .select('msg2.type')
          .whereRef('msg2.room_id', '=', 'g.id')
          .orderBy('msg2.created_at', 'desc')
          .limit(1)
          .as('last_type'),
        eb
          .selectFrom('chat.messages as unread')
          .select((e) => e.fn.countAll<string>().as('c'))
          .whereRef('unread.room_id', '=', 'g.id')
          .whereRef('unread.created_at', '>', 'gm.last_read_at')
          .where('unread.sender_id', 'is not', null)
          .as('unread_count'),
        eb
          .selectFrom('social.group_members as other')
          .innerJoin('member.users as ou', 'ou.id', 'other.user_id')
          .select('ou.nickname')
          .whereRef('other.group_id', '=', 'g.id')
          .where('other.user_id', '!=', me)
          .limit(1)
          .as('other_nickname'),
      ])
      .where('gm.user_id', '=', me)
      .orderBy('g.updated_at', 'desc')
      .execute();

    return rows.map((row) => ({
      id: row.id,
      name: row.is_direct ? (row.other_nickname ?? '') : row.name,
      memberCount: Number(row.member_count ?? 0),
      lastMessage: row.last_type === 'location' ? '위치를 공유했어요.' : (row.last_text ?? undefined),
      updatedAt: new Date(row.updated_at).toISOString(),
      unreadCount: Number(row.unread_count ?? 0),
    }));
  }

  /** 지난 대화 (오래된 것 → 최신 순). before 를 주면 그보다 이전 메시지 */
  async messages(me: string, roomId: string, before?: string): Promise<ChatMessageResponse[]> {
    await this.groups.assertMember(roomId, me);
    let query = this.db
      .selectFrom('chat.messages')
      .select(['id', 'room_id', 'sender_id', 'type', 'text', 'place', 'created_at'])
      .where('room_id', '=', roomId)
      .orderBy('created_at', 'desc')
      .limit(PAGE_SIZE);
    if (before) query = query.where('created_at', '<', new Date(before));
    const rows = await query.execute();
    return rows.reverse().map((row) => toMessage(row));
  }

  async send(me: string, roomId: string, input: SendMessageInput): Promise<ChatMessageResponse> {
    await this.groups.assertMember(roomId, me);
    const row = await this.db.transaction().execute(async (trx) => {
      const inserted = await trx
        .insertInto('chat.messages')
        .values({
          room_id: roomId,
          sender_id: me,
          type: input.type,
          text: input.type === 'text' ? input.text : null,
          place: input.type === 'location' ? JSON.stringify(input.place) : null,
        })
        .returning(['id', 'room_id', 'sender_id', 'type', 'text', 'place', 'created_at'])
        .executeTakeFirstOrThrow();
      await trx.updateTable('social.groups').set({ updated_at: new Date() }).where('id', '=', roomId).execute();
      // 보낸 사람은 읽은 것으로
      await trx
        .updateTable('social.group_members')
        .set({ last_read_at: new Date() })
        .where('group_id', '=', roomId)
        .where('user_id', '=', me)
        .execute();
      return inserted;
    });
    return toMessage(row);
  }

  async markRead(me: string, roomId: string) {
    await this.groups.assertMember(roomId, me);
    await this.db
      .updateTable('social.group_members')
      .set({ last_read_at: new Date() })
      .where('group_id', '=', roomId)
      .where('user_id', '=', me)
      .execute();
  }

  /** 방 삭제는 서버 대화만 지웁니다 (기기 보관함은 그대로, WBS 7.6) */
  async clearRoomMessages(me: string, roomId: string) {
    const group = await this.groups.assertMember(roomId, me);
    if (group.owner_id !== me) throw appError(HttpStatus.FORBIDDEN, 'NOT_GROUP_OWNER', '방장만 대화를 지울 수 있습니다');
    await this.db.deleteFrom('chat.messages').where('room_id', '=', roomId).execute();
  }
}

type MessageRow = {
  id: string;
  room_id: string;
  sender_id: string | null;
  type: 'text' | 'location' | 'system';
  text: string | null;
  place: SharedPlace | null;
  created_at: Date;
};

function toMessage(row: MessageRow): ChatMessageResponse {
  return {
    id: row.id,
    roomId: row.room_id,
    senderId: row.sender_id,
    type: row.type,
    ...(row.text ? { text: row.text } : {}),
    ...(row.place ? { place: row.place } : {}),
    createdAt: new Date(row.created_at).toISOString(),
  };
}
