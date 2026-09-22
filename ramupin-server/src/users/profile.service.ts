import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';

import { appError } from '../common/app-error.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { LocationService } from '../location/location.service.js';

/**
 * 프로필 수정 · 숨김 모드 · 회원 탈퇴 (WBS 3.9, 9.5, 11.2).
 */

/** 닉네임 길이 (앱 입력칸과 같은 값) */
export const NICKNAME_MAX = 10;

export interface ProfilePatch {
  nickname?: string;
  avatarUrl?: string | null;
  gender?: 'male' | 'female' | null;
  statusMessage?: string | null;
}

export interface HideMode {
  hideAll: boolean;
  /** 이 시각이 지나면 저절로 풀립니다. 없으면 직접 끌 때까지 */
  until: string | null;
}

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    @Inject(MAIN_DB) private readonly db: MainDb,
    private readonly location: LocationService,
  ) {}

  /**
   * 닉네임을 쓸 수 있는지 (WBS 3.9).
   * 내가 지금 쓰는 닉네임은 "쓸 수 있음"입니다 — 바꾸지 않고 저장할 때 막히면 안 됩니다.
   */
  async isNicknameAvailable(userId: string, nickname: string): Promise<boolean> {
    const row = await this.db.selectFrom('member.users').select('id').where('nickname', '=', nickname).executeTakeFirst();
    return !row || row.id === userId;
  }

  async update(userId: string, patch: ProfilePatch) {
    if (patch.nickname != null && !(await this.isNicknameAvailable(userId, patch.nickname))) {
      throw appError(HttpStatus.CONFLICT, 'NICKNAME_TAKEN', '이미 쓰고 있는 닉네임입니다');
    }

    const row = await this.db
      .updateTable('member.users')
      .set({
        ...(patch.nickname != null ? { nickname: patch.nickname } : {}),
        ...(patch.avatarUrl !== undefined ? { avatar_url: patch.avatarUrl } : {}),
        ...(patch.gender !== undefined ? { gender: patch.gender } : {}),
        ...(patch.statusMessage !== undefined ? { status_message: patch.statusMessage } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', userId)
      .returning(['id', 'public_id', 'nickname', 'gender', 'birth_date', 'avatar_url', 'status_message', 'plan', 'single_household'])
      .executeTakeFirst();
    if (!row) throw appError(HttpStatus.NOT_FOUND, 'USER_NOT_FOUND', '사용자가 없습니다');

    return {
      id: row.id,
      publicId: row.public_id,
      nickname: row.nickname,
      gender: row.gender,
      birthDate: row.birth_date,
      avatarUrl: row.avatar_url,
      statusMessage: row.status_message,
      plan: row.plan,
      singleHouseholdMode: row.single_household,
    };
  }

  /**
   * 숨김 모드 읽기. 시간이 지났으면 꺼진 것으로 봅니다.
   *
   * 만료를 배치로 지우지 않고 읽을 때마다 보는 이유: 배치가 한 번 밀리면
   * 이미 풀렸어야 할 사람이 계속 숨겨집니다. 위치가 조용히 안 보이는 것이 이 앱에서 가장 위험합니다.
   */
  async getHideMode(userId: string): Promise<HideMode> {
    const row = await this.db.selectFrom('member.users').select(['hide_all', 'hide_until']).where('id', '=', userId).executeTakeFirst();
    if (!row || !row.hide_all) return { hideAll: false, until: null };
    if (row.hide_until && row.hide_until.getTime() <= Date.now()) return { hideAll: false, until: null };
    return { hideAll: true, until: row.hide_until?.toISOString() ?? null };
  }

  async setHideMode(userId: string, setting: HideMode): Promise<HideMode> {
    await this.db
      .updateTable('member.users')
      .set({
        hide_all: setting.hideAll,
        hide_until: setting.hideAll && setting.until ? new Date(setting.until) : null,
        updated_at: new Date(),
      })
      .where('id', '=', userId)
      .execute();
    return this.getHideMode(userId);
  }

  /** 지금 위치를 숨기고 있는 사람들 (친구 목록·여정에서 걸러 냅니다) */
  async hiddenAmong(userIds: string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const rows = await this.db
      .selectFrom('member.users')
      .select(['id', 'hide_until'])
      .where('id', 'in', userIds)
      .where('hide_all', '=', true)
      .execute();
    const now = Date.now();
    return new Set(rows.filter((r) => !r.hide_until || r.hide_until.getTime() > now).map((r) => r.id));
  }

  /**
   * 회원 탈퇴 (WBS 11.2: 전체 삭제, 복구 불가).
   *
   * 본 DB 는 사용자 행을 지우면 친구·그룹·SOS·안심장소가 따라 지워집니다 (ON DELETE CASCADE).
   * **위치 DB 는 다른 데이터베이스라 따라 지워지지 않으므로** 직접 지웁니다.
   *
   * 남기는 것: 탈퇴 사유(누가 썼는지는 남기지 않음), 그리고 위치정보 이용·제공 사실 확인자료.
   * 뒤엣것은 위치정보법상 보관 의무가 있는 자료라 지우면 안 됩니다.
   */
  async withdraw(userId: string, reason: string): Promise<{ ok: true }> {
    const user = await this.db
      .selectFrom('member.users')
      .select(['plan', 'created_at'])
      .where('id', '=', userId)
      .executeTakeFirst();
    if (!user) throw appError(HttpStatus.NOT_FOUND, 'USER_NOT_FOUND', '사용자가 없습니다');

    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto('member.withdrawal_reasons')
        .values({
          reason: reason.slice(0, 500),
          plan: user.plan,
          used_days: Math.max(0, Math.floor((Date.now() - user.created_at.getTime()) / 86_400_000)),
        })
        .execute();
      await trx.deleteFrom('member.users').where('id', '=', userId).execute();
    });

    // 본 DB 를 먼저 지웁니다. 여기서 실패하면 아무것도 지워지지 않고, 위치만 남는 일은 없습니다
    await this.location.deleteUserData(userId).catch((error: unknown) => {
      // 위치 삭제가 실패해도 탈퇴 자체는 끝난 것으로 둡니다. 다시 로그인할 수 없으니
      // 그 위치는 어디에도 보이지 않고, 보관 기간이 지나면 파티션째로 사라집니다
      this.logger.error(`탈퇴한 사용자의 위치 삭제 실패 (user ${userId}): ${String(error)}`);
    });

    this.logger.log(`회원 탈퇴 완료 (${user.plan} 등급, ${Math.floor((Date.now() - user.created_at.getTime()) / 86_400_000)}일 사용)`);
    return { ok: true };
  }
}
