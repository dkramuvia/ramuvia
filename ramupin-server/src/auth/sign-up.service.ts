import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Redis } from 'ioredis';

import { maskPhone, normalizePhone } from '../common/phone.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { PhoneService } from '../phone/phone.module.js';
import { REDIS } from '../redis/redis.module.js';
import { authError } from './auth-error.js';
import { SessionService, type DeviceInfo, type NewSession } from './session.service.js';
import { SmsService } from './sms.service.js';

/** 가입 진행 상태 (Redis 에만 보관, 가입이 끝나면 삭제) */
interface SignUpState {
  provider: string;
  providerUserId: string;
  suggestedNickname: string | null;
  avatarUrl: string | null;
  /** 인증번호를 보낸 번호 */
  pendingPhone?: string;
  codeHash?: string;
  codeExpiresAt?: number;
  lastSentAt?: number;
  sends: number;
  attempts: number;
  /** 문자 인증을 통과한 번호 */
  verifiedPhone?: string;
}

export interface SignUpProfile {
  nickname: string;
  gender: 'male' | 'female';
  birthDate: string;
  agreedTerms: string[];
  singleHousehold: boolean;
}

const stateKey = (id: string) => `auth:sign-up:${id}`;
const SIGN_UP_TTL_SEC = 1800;
const CODE_TTL_SEC = 180;
const RESEND_AFTER_SEC = 30;
const MAX_SENDS = 5;
const MAX_ATTEMPTS = 5;
/** WBS 3.7·4: 이 나이 이상은 케어(무료) 등급. TODO(정책): 70/75 확정되면 정책값으로 */
const SENIOR_AGE = 75;
const NICKNAME_RE = /^[가-힣a-zA-Z0-9._-]{2,8}$/;

/**
 * 소셜 로그인으로 처음 들어온 사람의 가입 (카카오 먼저, 다른 소셜도 같은 흐름).
 * 순서: 소셜 로그인 → (가입 토큰) → 휴대폰 문자 인증 → 프로필·약관 → 가입 완료 → 로그인 세션 발급
 * 전화번호는 소셜에서 받지 않고 여기서 직접 인증합니다 (대표님 방침, 비즈 앱 전환 불필요).
 */
@Injectable()
export class SignUpService {
  constructor(
    @Inject(MAIN_DB) private readonly db: MainDb,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly jwt: JwtService,
    private readonly sms: SmsService,
    private readonly phones: PhoneService,
    private readonly sessions: SessionService,
  ) {}

  /** 소셜 로그인 후 신규 회원이면 가입 토큰 발급 */
  async start(provider: string, providerUserId: string, nickname: string | null, avatarUrl: string | null) {
    const id = randomUUID();
    const state: SignUpState = { provider, providerUserId, suggestedNickname: nickname, avatarUrl, sends: 0, attempts: 0 };
    await this.redis.set(stateKey(id), JSON.stringify(state), 'EX', SIGN_UP_TTL_SEC);
    const signUpToken = await this.jwt.signAsync({ sub: id, typ: 'sign-up' }, { expiresIn: `${SIGN_UP_TTL_SEC}s` });
    return { signUpToken, suggestedNickname: nickname, expiresInSec: SIGN_UP_TTL_SEC };
  }

  async checkNickname(nickname: string): Promise<{ available: boolean; reason?: 'format' | 'taken' }> {
    const value = nickname.trim();
    if (!NICKNAME_RE.test(value)) return { available: false, reason: 'format' };
    const row = await this.db.selectFrom('member.users').select('id').where('nickname', '=', value).executeTakeFirst();
    return row ? { available: false, reason: 'taken' } : { available: true };
  }

  /** 가입 중 휴대폰 인증번호 발송. 이미 가입된 번호면 보내지 않고 알려줍니다 (WBS 3.7) */
  async sendPhoneCode(signUpToken: string, rawPhone: string) {
    const { id, state } = await this.load(signUpToken);
    const phone = normalizePhone(rawPhone);
    const now = Date.now();

    if (await this.phones.isRegistered(phone)) {
      return { alreadyRegistered: true, codeExpiresInSec: 0, resendAfterSec: 0, phoneMasked: maskPhone(phone) };
    }
    if (state.lastSentAt && now - state.lastSentAt < RESEND_AFTER_SEC * 1000) {
      throw authError(HttpStatus.TOO_MANY_REQUESTS, 'SMS_TOO_SOON', { retryAfterSec: Math.ceil((state.lastSentAt + RESEND_AFTER_SEC * 1000 - now) / 1000) });
    }
    if (state.sends >= MAX_SENDS) throw authError(HttpStatus.TOO_MANY_REQUESTS, 'SMS_LIMIT');

    const code = this.sms.fixedDevCode ?? String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.sms.sendVerificationCode(phone, code, '가입 인증');

    Object.assign(state, {
      pendingPhone: phone,
      codeHash: this.hashCode(id, code),
      codeExpiresAt: now + CODE_TTL_SEC * 1000,
      lastSentAt: now,
      sends: state.sends + 1,
      attempts: 0,
    });
    await this.save(id, state);
    return { alreadyRegistered: false, codeExpiresInSec: CODE_TTL_SEC, resendAfterSec: RESEND_AFTER_SEC, phoneMasked: maskPhone(phone) };
  }

  async verifyPhoneCode(signUpToken: string, code: string) {
    const { id, state } = await this.load(signUpToken);
    if (!state.codeHash || !state.codeExpiresAt || !state.pendingPhone) throw authError(HttpStatus.BAD_REQUEST, 'CODE_NOT_SENT');
    if (Date.now() > state.codeExpiresAt) throw authError(HttpStatus.BAD_REQUEST, 'CODE_EXPIRED');

    const expected = Buffer.from(state.codeHash);
    const actual = Buffer.from(this.hashCode(id, code));
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      state.attempts += 1;
      await this.save(id, state);
      if (state.attempts >= MAX_ATTEMPTS) {
        await this.redis.del(stateKey(id));
        throw authError(HttpStatus.TOO_MANY_REQUESTS, 'CODE_ATTEMPTS_EXCEEDED');
      }
      throw authError(HttpStatus.BAD_REQUEST, 'CODE_INVALID', { remainingAttempts: MAX_ATTEMPTS - state.attempts });
    }

    state.verifiedPhone = state.pendingPhone;
    state.codeHash = undefined;
    state.codeExpiresAt = undefined;
    await this.save(id, state);
    return { verified: true, phoneMasked: maskPhone(state.verifiedPhone) };
  }

  /** 가입 완료 → 회원 생성 + 첫 로그인 세션 */
  async complete(signUpToken: string, profile: SignUpProfile, device: DeviceInfo): Promise<NewSession & { publicId: string }> {
    const { id, state } = await this.load(signUpToken);
    if (!state.verifiedPhone) throw authError(HttpStatus.BAD_REQUEST, 'PHONE_NOT_VERIFIED');

    const nickname = profile.nickname.trim();
    const check = await this.checkNickname(nickname);
    if (!check.available) throw authError(HttpStatus.CONFLICT, 'NICKNAME_TAKEN');
    if (await this.phones.isRegistered(state.verifiedPhone)) throw authError(HttpStatus.CONFLICT, 'PHONE_ALREADY_REGISTERED');

    const age = this.ageOf(profile.birthDate);
    // 노인 무료 등급 (WBS 3.7). 나이 기준은 위 SENIOR_AGE
    const plan = age !== null && age >= SENIOR_AGE ? 'care' : 'basic';

    const user = await this.db.transaction().execute(async (trx) => {
      const created = await trx
        .insertInto('member.users')
        .values({
          public_id: await this.newPublicId(),
          nickname,
          gender: profile.gender,
          birth_date: profile.birthDate,
          avatar_url: state.avatarUrl,
          plan,
          single_household: profile.singleHousehold,
          last_active_at: new Date(),
        })
        .returning(['id', 'public_id'])
        .executeTakeFirstOrThrow();

      await trx
        .insertInto('member.social_accounts')
        .values({ user_id: created.id, provider: state.provider, provider_user_id: state.providerUserId })
        .execute();

      if (profile.agreedTerms.length) {
        await trx
          .insertInto('member.terms_agreements')
          // TODO(9단계): 확정된 약관 버전으로 교체
          .values(profile.agreedTerms.map((term) => ({ user_id: created.id, term_key: term, version: '2026-09' })))
          .onConflict((oc) => oc.doNothing())
          .execute();
      }

      await this.phones.save(created.id, state.verifiedPhone!, trx);
      return created;
    });

    await this.redis.del(stateKey(id));
    // TODO(WBS 4): 1인 가구인데 친구가 없으면 회사 계정(RamuVia)을 친구로 추가
    const session = await this.sessions.createSession(user.id, device, state.provider, { verified: true });
    return { ...session, publicId: user.public_id };
  }

  /** 화면에 보이는 8자리 ID */
  private async newPublicId(): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const candidate = String(randomInt(10_000_000, 100_000_000));
      const exists = await this.db.selectFrom('member.users').select('id').where('public_id', '=', candidate).executeTakeFirst();
      if (!exists) return candidate;
    }
    throw new Error('8자리 ID 를 만들지 못했습니다');
  }

  private ageOf(birthDate: string): number | null {
    const birth = new Date(birthDate);
    if (Number.isNaN(birth.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age -= 1;
    return age;
  }

  private async load(signUpToken: string): Promise<{ id: string; state: SignUpState }> {
    let payload: { sub: string; typ?: string };
    try {
      payload = await this.jwt.verifyAsync(signUpToken);
    } catch {
      throw authError(HttpStatus.UNAUTHORIZED, 'SIGN_UP_TOKEN_INVALID');
    }
    if (payload.typ !== 'sign-up') throw authError(HttpStatus.UNAUTHORIZED, 'SIGN_UP_TOKEN_INVALID');
    const raw = await this.redis.get(stateKey(payload.sub));
    if (!raw) throw authError(HttpStatus.UNAUTHORIZED, 'SIGN_UP_TOKEN_INVALID');
    return { id: payload.sub, state: JSON.parse(raw) as SignUpState };
  }

  private async save(id: string, state: SignUpState) {
    await this.redis.call('SET', stateKey(id), JSON.stringify(state), 'XX', 'KEEPTTL');
  }

  private hashCode(id: string, code: string) {
    return createHash('sha256').update(`${id}:${code}`).digest('hex');
  }
}
