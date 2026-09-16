import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';

import { appError } from '../common/app-error.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';

export const shareSettingBody = z.object({
  locationLevel: z.enum(['exact', 'blurred', 'hidden']),
  showStatus: z.boolean(),
  shareRoute: z.boolean(),
  shareBattery: z.boolean(),
});

export type ShareSettingInput = z.infer<typeof shareSettingBody>;

/** 앱 src/types/models.ts 의 FriendShareSetting */
export interface ShareSettingResponse extends ShareSettingInput {
  friendId: string;
}

/**
 * 기획 규칙 (설정 2 - 친구별 상세 공유), 앱 src/features/sharing/shareRules.ts 와 같음
 * - 흐림: 이동경로 공유 불가 / 비공개: 전부 불가
 * 앱이 잠근 토글 값을 보내도 서버에서 한 번 더 맞춥니다 (DB CHECK 제약도 있음)
 */
export function normalizeShareSetting(input: ShareSettingInput): ShareSettingInput {
  if (input.locationLevel === 'hidden') return { locationLevel: 'hidden', showStatus: false, shareRoute: false, shareBattery: false };
  if (input.locationLevel === 'blurred') return { ...input, shareRoute: false };
  return input;
}

const notFriend = () => appError(HttpStatus.NOT_FOUND, 'NOT_FRIEND', '친구가 아닙니다');

/** 내가(owner) 친구에게 무엇을 공유할지 */
@Injectable()
export class ShareSettingsService {
  constructor(@Inject(MAIN_DB) private readonly db: MainDb) {}

  async get(me: string, friendId: string): Promise<ShareSettingResponse> {
    const row = await this.db
      .selectFrom('social.friend_share_settings')
      .select(['location_level', 'show_status', 'share_route', 'share_battery'])
      .where('owner_id', '=', me)
      .where('friend_id', '=', friendId)
      .executeTakeFirst();
    if (!row) throw notFriend();
    return {
      friendId,
      locationLevel: row.location_level,
      showStatus: row.show_status,
      shareRoute: row.share_route,
      shareBattery: row.share_battery,
    };
  }

  /** TODO(실시간 단계): 바뀐 공유 수준을 친구 화면에 바로 반영 (WebSocket) */
  async save(me: string, friendId: string, input: ShareSettingInput): Promise<ShareSettingResponse> {
    const setting = normalizeShareSetting(input);
    const result = await this.db
      .updateTable('social.friend_share_settings')
      .set({
        location_level: setting.locationLevel,
        show_status: setting.showStatus,
        share_route: setting.shareRoute,
        share_battery: setting.shareBattery,
        updated_at: new Date(),
      })
      .where('owner_id', '=', me)
      .where('friend_id', '=', friendId)
      .executeTakeFirst();
    if (Number(result.numUpdatedRows) === 0) throw notFriend();
    return { friendId, ...setting };
  }
}
