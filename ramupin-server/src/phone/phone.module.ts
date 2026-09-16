import { Global, Inject, Injectable, Logger, Module } from '@nestjs/common';
import type { Transaction } from 'kysely';

import { decryptPhone, encryptPhone, hashPhone, maskPhone, normalizePhone } from '../common/phone.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import type { MainDatabase } from '../database/main.schema.js';

/** 번호 원문을 꺼내는 이유 (member.phone_access_logs 에 남습니다) */
export type PhoneAccessPurpose = 'sms_sign_up' | 'sms_device_verify' | 'sms_emergency' | 'sms_scheduled' | 'mask_display' | 'admin';

/**
 * 전화번호 보관소.
 * ★ 번호 원문(복호화)은 이 서비스에서만 다룹니다. 다른 모듈은 여기를 통해서만 접근하세요.
 * 꺼낼 때마다 조회 이력을 남깁니다.
 */
@Injectable()
export class PhoneService {
  private readonly logger = new Logger(PhoneService.name);

  constructor(@Inject(MAIN_DB) private readonly db: MainDb) {}

  /** 이미 가입에 사용된 번호인지 (원문을 읽지 않고 해시로만 확인) */
  async isRegistered(phone: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('member.user_phones')
      .select('user_id')
      .where('phone_hash', '=', hashPhone(phone))
      .executeTakeFirst();
    return !!row;
  }

  async findUserIdByPhone(phone: string): Promise<string | null> {
    const row = await this.db
      .selectFrom('member.user_phones')
      .select('user_id')
      .where('phone_hash', '=', hashPhone(phone))
      .executeTakeFirst();
    return row?.user_id ?? null;
  }

  /** 가입·번호 변경 시 저장 (문자 인증을 통과한 번호만) */
  async save(userId: string, phone: string, trx?: Transaction<MainDatabase>): Promise<void> {
    const db = trx ?? this.db;
    const now = new Date();
    await db
      .insertInto('member.user_phones')
      .values({ user_id: userId, phone_hash: hashPhone(phone), phone_encrypted: encryptPhone(phone), verified_at: now, updated_at: now })
      .onConflict((oc) =>
        oc.column('user_id').doUpdateSet((eb) => ({
          phone_hash: eb.ref('excluded.phone_hash'),
          phone_encrypted: eb.ref('excluded.phone_encrypted'),
          verified_at: now,
          updated_at: now,
        })),
      )
      .execute();
  }

  /** 문자 발송용 번호. 이력이 남습니다 */
  async getForSend(userId: string, purpose: PhoneAccessPurpose, actor = 'system'): Promise<string | null> {
    const row = await this.db
      .selectFrom('member.user_phones')
      .select('phone_encrypted')
      .where('user_id', '=', userId)
      .executeTakeFirst();
    if (!row) return null;
    await this.logAccess(userId, purpose, actor);
    try {
      return decryptPhone(row.phone_encrypted);
    } catch (error) {
      // 암호화 키가 바뀌면 복호화에 실패합니다
      this.logger.error(`번호 복호화 실패 (user ${userId}): ${String(error)}`);
      return null;
    }
  }

  /** 화면 표시용 010-****-5678 */
  async getMasked(userId: string, actor = 'system'): Promise<string | null> {
    const phone = await this.getForSend(userId, 'mask_display', actor);
    return phone ? maskPhone(phone) : null;
  }

  /** 탈퇴 시 삭제 (개인정보 파기) */
  async remove(userId: string, trx?: Transaction<MainDatabase>): Promise<void> {
    await (trx ?? this.db).deleteFrom('member.user_phones').where('user_id', '=', userId).execute();
  }

  private async logAccess(userId: string, purpose: PhoneAccessPurpose, actor: string) {
    await this.db
      .insertInto('member.phone_access_logs')
      .values({ user_id: userId, purpose, actor, created_at: new Date() })
      .execute()
      .catch((error) => this.logger.error(`번호 조회 이력 기록 실패: ${String(error)}`));
  }
}

@Global()
@Module({ providers: [PhoneService], exports: [PhoneService] })
export class PhoneModule {}

export { maskPhone, normalizePhone };
