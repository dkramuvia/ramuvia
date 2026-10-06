import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';

import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
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
  /** 소셜이 확인해 준 출생연도 (WBS 3.6). 동의 항목이 없으면 없습니다 */
  verifiedBirthYear?: number;
  /** 소셜이 알려 준 성별. 가입 화면 기본값으로만 씁니다 */
  suggestedGender?: 'male' | 'female';
  /** 인증번호를 보낸 번호 */
  pendingPhone?: string;
  codeHash?: string;
  codeExpiresAt?: number;
  lastSentAt?: number;
  sends: number;
  attempts: number;
  /** 문자 인증을 통과한 번호 */
  verifiedPhone?: string;
  /**
   * 휴대폰 인증 화면에서 고른 국가 (ISO 3166-1 alpha-2).
   * 가입이 끝나면 사용자 행에 그대로 들어갑니다 — 관리자 관제센터의 국가별 집계용
   */
  country?: string;
}

/** 소셜에서 받아 온 사람. 제공자마다 주는 항목이 달라 없는 것은 null 입니다 */
export interface SocialIdentity {
  providerUserId: string;
  nickname: string | null;
  avatarUrl: string | null;
  /** 제공자가 확인해 준 출생연도 (카카오 비즈앱·네이버 동의 항목) */
  birthYear?: number | null;
  gender?: 'male' | 'female' | null;
}

export interface SignUpProfile {
  nickname: string;
  gender: 'male' | 'female';
  birthDate: string;
  /** 가입 화면에서 고른 캐릭터 (`avatar:boy-01`). 없으면 소셜 프로필 사진을 씁니다 */
  avatarUrl?: string;
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
  private readonly logger = new Logger(SignUpService.name);

  constructor(
    @Inject(MAIN_DB) private readonly db: MainDb,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly jwt: JwtService,
    private readonly sms: SmsService,
    private readonly phones: PhoneService,
    private readonly sessions: SessionService,
  ) {}

  /** 소셜 로그인 후 신규 회원이면 가입 토큰 발급 */
  async start(provider: string, social: SocialIdentity) {
    const id = randomUUID();
    const state: SignUpState = {
      provider,
      providerUserId: social.providerUserId,
      suggestedNickname: social.nickname,
      avatarUrl: social.avatarUrl,
      ...(social.birthYear != null ? { verifiedBirthYear: social.birthYear } : {}),
      ...(social.gender ? { suggestedGender: social.gender } : {}),
      sends: 0,
      attempts: 0,
    };
    await this.redis.set(stateKey(id), JSON.stringify(state), 'EX', SIGN_UP_TTL_SEC);
    const signUpToken = await this.jwt.signAsync({ sub: id, typ: 'sign-up' }, { expiresIn: `${SIGN_UP_TTL_SEC}s` });
    return {
      signUpToken,
      provider,
      suggestedNickname: social.nickname,
      // 앱이 가입 화면 기본값으로 씁니다. 출생연도는 소셜이 확인해 준 것이라 바꿀 수 없게 보여 줍니다
      suggestedGender: social.gender ?? null,
      verifiedBirthYear: social.birthYear ?? null,
      expiresInSec: SIGN_UP_TTL_SEC,
    };
  }

  async checkNickname(nickname: string): Promise<{ available: boolean; reason?: 'format' | 'taken' }> {
    const value = nickname.trim();
    if (!NICKNAME_RE.test(value)) return { available: false, reason: 'format' };
    const row = await this.db.selectFrom('member.users').select('id').where('nickname', '=', value).executeTakeFirst();
    return row ? { available: false, reason: 'taken' } : { available: true };
  }

  /** 가입 중 휴대폰 인증번호 발송. 이미 가입된 번호면 보내지 않고 알려줍니다 (WBS 3.7) */
  async sendPhoneCode(signUpToken: string, rawPhone: string, country = 'KR') {
    const { id, state } = await this.load(signUpToken);
    const phone = normalizePhone(rawPhone);
    const now = Date.now();
    // 인증 화면에서 고른 국가를 여기서 들고 있다가, 가입이 끝나면 사용자 행에 넣습니다
    state.country = country;

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

    const decision = decidePlan(state.verifiedBirthYear ?? null, profile.birthDate);
    if (decision.mismatch) {
      // 막지는 않습니다 — 생일이 안 지났거나 잘못 눌렀을 수도 있습니다. 다만 기록은 남깁니다
      this.logger.warn(`적은 나이와 ${state.provider} 확인 나이가 다릅니다 (${decision.age}세로 처리)`);
    }
    const { plan } = decision;
    const verified = state.verifiedBirthYear;

    const user = await this.db.transaction().execute(async (trx) => {
      const created = await trx
        .insertInto('member.users')
        .values({
          public_id: await this.newPublicId(),
          nickname,
          gender: profile.gender,
          birth_date: profile.birthDate,
          avatar_url: profile.avatarUrl ?? state.avatarUrl,
          plan,
          age_verified: verified != null,
          single_household: profile.singleHousehold,
          // 휴대폰 인증 화면에서 고른 국가. 없으면 KR (지금 가입자는 전부 국내입니다)
          country: state.country ?? 'KR',
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

/**
 * 노인 무료 등급을 줄지 (WBS 3.6·3.7).
 *
 * **소셜이 확인해 준 출생연도가 있으면 그것만 봅니다.** 본인이 적은 생년월일로 정하면
 * 아무나 1950년생이라고 적어 유료 등급을 공짜로 받을 수 있습니다. 카카오는 비즈 앱 전환,
 * 네이버는 "출생연도" 동의 항목이 있어야 값이 옵니다 — 없으면 적은 값을 쓸 수밖에 없습니다.
 *
 * 확인된 연도가 있을 때는 나이를 **연도 차이**로만 셉니다. 생일이 지났는지까지는 알 수 없고,
 * 그 하루 이틀 때문에 무료 등급이 갈리는 것이 더 이상합니다.
 */
export function decidePlan(
  verifiedBirthYear: number | null,
  declaredBirthDate: string,
  now = new Date(),
): { age: number | null; plan: 'care' | 'basic'; ageVerified: boolean; mismatch: boolean } {
  const declared = ageOf(declaredBirthDate, now);
  const age = verifiedBirthYear != null ? now.getFullYear() - verifiedBirthYear : declared;
  return {
    age,
    plan: age !== null && age >= SENIOR_AGE ? 'care' : 'basic',
    ageVerified: verifiedBirthYear != null,
    // 생일이 아직 안 지났으면 1살 차이는 정상입니다
    mismatch: verifiedBirthYear != null && declared != null && age != null && Math.abs(age - declared) > 1,
  };
}

function ageOf(birthDate: string, now: Date): number | null {
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age -= 1;
  return age;
}
