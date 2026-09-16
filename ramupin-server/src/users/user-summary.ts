import type { Selectable } from 'kysely';

import type { UsersTable } from '../database/main.schema.js';

/** 앱 src/types/models.ts 의 UserSummary 와 같은 모양 (친구가 아닌 사람에게 보여도 되는 정보만) */
export interface UserSummary {
  id: string;
  publicId: string;
  nickname: string;
  avatarUrl: string | null;
  /** 공개된 대략적 위치 (예: 화성시 제부도). TODO(위치 단계): 흐림 위치 → 행정구역 이름 */
  areaName: string | null;
  lastActiveAt: string | null;
}

export type UserSummaryRow = Pick<Selectable<UsersTable>, 'id' | 'public_id' | 'nickname' | 'avatar_url' | 'last_active_at'>;

export const USER_SUMMARY_COLUMNS = ['id', 'public_id', 'nickname', 'avatar_url', 'last_active_at'] as const;

export function toUserSummary(row: UserSummaryRow): UserSummary {
  return {
    id: row.id,
    publicId: row.public_id,
    nickname: row.nickname,
    avatarUrl: row.avatar_url,
    areaName: null,
    lastActiveAt: row.last_active_at ? new Date(row.last_active_at).toISOString() : null,
  };
}
