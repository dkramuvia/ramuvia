import { randomBytes } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import type { Transaction } from 'kysely';

import { appError } from '../common/app-error.js';
import { decryptPhone, encryptPhone, maskPhone } from '../common/phone.js';
import { env } from '../config/env.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import type { MainDatabase } from '../database/main.schema.js';
import { isDomesticMobile } from '../sos/sos-sms.service.js';
import { SmsService } from './sms.service.js';

/**
 * 보호자 동의 (만 14세 미만, 보완 화면 설계 4.1, 수정 반영본 C3).
 *
 * 흐름: 가입 → 계정은 "대기"(pending_guardian) → 보호자 휴대폰으로 동의 링크 문자(알리고)
 *       → 보호자가 웹 페이지에서 동의 → active. 24시간 안에 동의가 없으면 계정과 입력 정보를 모두 지웁니다.
 * 대기 중에는 위치를 받지 않습니다 (location.module.ts).
 * 해외 번호는 이메일로 받기로 했지만 메일 발송 수단이 아직 없어, 지금은 국내 휴대폰 번호만 받습니다.
 */

/** 나라별 보호자 동의가 필요한 나이 (확정 필요 사항: 국가별 나이 기준 표) */
const CONSENT_AGE: Record<string, number> = { KR: 14, US: 13 };
const DEFAULT_CONSENT_AGE = 14;
/** 동의를 기다리는 시간 */
const WAIT_MS = 24 * 60 * 60_000;
/** 다시 보내기 한도 (문자 비용) */
const MAX_RESEND = 5;
const TOKEN_BYTES = 24;

export interface GuardianInput {
  name: string;
  phone: string;
  sosLink: boolean;
}

export function consentAgeFor(country: string | null | undefined): number {
  return CONSENT_AGE[country ?? 'KR'] ?? DEFAULT_CONSENT_AGE;
}

/** 만 나이 (생년월일 'YYYY-MM-DD') */
export function ageOn(birthDate: string, now = new Date()): number {
  const [y, m, d] = birthDate.split('-').map(Number);
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age -= 1;
  return age;
}

@Injectable()
export class GuardianService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(GuardianService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(MAIN_DB) private readonly db: MainDb,
    private readonly sms: SmsService,
  ) {}

  onModuleInit() {
    // 24시간이 지난 대기 계정을 한 시간마다 지웁니다
    this.timer = setInterval(() => void this.purgeExpired(), 60 * 60_000);
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  needsConsent(birthDate: string, country: string | null | undefined): boolean {
    return ageOn(birthDate) < consentAgeFor(country);
  }

  /** 가입 트랜잭션 안에서 동의 요청을 만듭니다. 문자는 트랜잭션이 끝난 뒤 send() 로 */
  async create(trx: Transaction<MainDatabase>, userId: string, guardian: GuardianInput): Promise<string> {
    if (!isDomesticMobile(guardian.phone)) {
      throw appError(HttpStatus.BAD_REQUEST, 'GUARDIAN_PHONE', '보호자의 국내 휴대폰 번호를 적어 주세요');
    }
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    await trx
      .insertInto('member.guardian_consents')
      .values({
        user_id: userId,
        guardian_name: guardian.name,
        phone_encrypted: encryptPhone(guardian.phone),
        sos_link: guardian.sosLink,
        token,
        expires_at: new Date(Date.now() + WAIT_MS),
      })
      .execute();
    return token;
  }

  /** 동의 링크 문자 보내기 */
  async send(userId: string) {
    const row = await this.db
      .selectFrom('member.guardian_consents as g')
      .innerJoin('member.users as u', 'u.id', 'g.user_id')
      .select(['g.phone_encrypted', 'g.token', 'g.guardian_name', 'u.nickname'])
      .where('g.user_id', '=', userId)
      .executeTakeFirst();
    if (!row) return;
    const text = `[라무핀] ${row.nickname}님이 라무핀 가입을 위해 보호자 동의를 요청했어요. 24시간 안에 아래에서 확인하고 동의해 주세요.\n${env.PUBLIC_LINK_URL}/consent/${row.token}`;
    await this.sms.send(decryptPhone(row.phone_encrypted), text, '보호자 동의', 'LMS').catch((error: unknown) => {
      this.logger.error(`보호자 동의 문자 실패: ${String(error)}`);
      throw appError(HttpStatus.BAD_GATEWAY, 'GUARDIAN_SMS_FAILED', '보호자에게 문자를 보내지 못했어요. 잠시 후 다시 보내 주세요');
    });
  }

  /** 앱의 대기 화면: 누구에게 언제까지 */
  async status(userId: string) {
    const row = await this.db
      .selectFrom('member.guardian_consents as g')
      .innerJoin('member.users as u', 'u.id', 'g.user_id')
      .select(['g.guardian_name', 'g.phone_encrypted', 'g.expires_at', 'g.consented_at', 'g.resend_count', 'u.status'])
      .where('g.user_id', '=', userId)
      .executeTakeFirst();
    if (!row) return { required: false, consented: true };
    return {
      required: true,
      consented: !!row.consented_at && row.status === 'active',
      guardianName: row.guardian_name,
      maskedPhone: maskPhone(decryptPhone(row.phone_encrypted)),
      expiresAt: row.expires_at.toISOString(),
      resendLeft: Math.max(0, MAX_RESEND - row.resend_count),
    };
  }

  async resend(userId: string) {
    const row = await this.db
      .updateTable('member.guardian_consents')
      .set((eb) => ({ resend_count: eb('resend_count', '+', 1) }))
      .where('user_id', '=', userId)
      .where('consented_at', 'is', null)
      .where('resend_count', '<', MAX_RESEND)
      .where('expires_at', '>', new Date())
      .returning('user_id')
      .executeTakeFirst();
    if (!row) throw appError(HttpStatus.TOO_MANY_REQUESTS, 'GUARDIAN_RESEND_LIMIT', '더 보낼 수 없어요. 시간이 지났거나 횟수를 다 썼어요');
    await this.send(userId);
    return this.status(userId);
  }

  /** 동의 페이지에 보여 줄 내용 (로그인 없음). 없거나 지났으면 null */
  async preview(token: string) {
    const row = await this.db
      .selectFrom('member.guardian_consents as g')
      .innerJoin('member.users as u', 'u.id', 'g.user_id')
      .select(['u.nickname', 'u.birth_date', 'g.guardian_name', 'g.sos_link', 'g.expires_at', 'g.consented_at'])
      .where('g.token', '=', token)
      .executeTakeFirst();
    if (!row) return null;
    return { ...row, expired: row.expires_at.getTime() < Date.now() };
  }

  /** 보호자 동의. 계정을 active 로 바꾸고, SOS 자동 연결을 골랐으면 보호자를 SOS 문자 연락처로 넣습니다 */
  async consent(token: string, meta: { ip: string | null; agent: string | null }): Promise<'ok' | 'expired' | 'missing'> {
    return this.db.transaction().execute(async (trx) => {
      const row = await trx
        .selectFrom('member.guardian_consents')
        .select(['user_id', 'expires_at', 'consented_at', 'sos_link', 'guardian_name', 'phone_encrypted'])
        .where('token', '=', token)
        .forUpdate()
        .executeTakeFirst();
      if (!row) return 'missing';
      if (row.consented_at) return 'ok';
      if (row.expires_at.getTime() < Date.now()) return 'expired';
      await trx
        .updateTable('member.guardian_consents')
        .set({ consented_at: new Date(), consent_ip: meta.ip, consent_agent: meta.agent?.slice(0, 300) ?? null })
        .where('user_id', '=', row.user_id)
        .execute();
      await trx.updateTable('member.users').set({ status: 'active' }).where('id', '=', row.user_id).where('status', '=', 'pending_guardian').execute();
      if (row.sos_link) {
        await trx
          .insertInto('member.sos_contacts')
          .values({ user_id: row.user_id, name: `보호자 ${row.guardian_name}`, phone_encrypted: row.phone_encrypted })
          .execute();
      }
      this.logger.log(`보호자 동의 완료 (user ${row.user_id})`);
      return 'ok';
    });
  }

  /** 24시간 안에 동의가 없는 대기 계정을 지웁니다 (입력 정보 전체) */
  async purgeExpired(): Promise<number> {
    try {
      const rows = await this.db
        .deleteFrom('member.users')
        .where('status', '=', 'pending_guardian')
        .where('id', 'in', (eb) =>
          eb.selectFrom('member.guardian_consents').select('user_id').where('consented_at', 'is', null).where('expires_at', '<', new Date()),
        )
        .returning('id')
        .execute();
      if (rows.length) this.logger.warn(`보호자 동의가 없어 대기 계정 ${rows.length}개를 지웠습니다`);
      return rows.length;
    } catch (error) {
      this.logger.error(`대기 계정 정리 실패: ${String(error)}`);
      return 0;
    }
  }
}
