import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { maskPhone } from '../common/phone.js';
import { PhoneService } from '../phone/phone.module.js';
import { REDIS } from '../redis/redis.module.js';
import { authError } from './auth-error.js';
import type { DeviceInfo } from './session.service.js';
import { SmsService } from './sms.service.js';

/** 로그인은 됐지만 새 기기라 문자 인증을 기다리는 상태 (Redis 에만 보관) */
interface Challenge {
  userId: string;
  device: DeviceInfo;
  authMethod: string;
  codeHash?: string;
  codeExpiresAt?: number;
  lastSentAt?: number;
  sends: number;
  attempts: number;
}

const challengeKey = (id: string) => `auth:device-challenge:${id}`;
const dailyKey = (userId: string) => `auth:sms-daily:${userId}:${new Date().toISOString().slice(0, 10)}`;

const CHALLENGE_TTL_SEC = 600;
const CODE_TTL_SEC = 180;
const RESEND_AFTER_SEC = 30;
const MAX_SENDS_PER_CHALLENGE = 5;
const MAX_SENDS_PER_DAY = 10;
const MAX_ATTEMPTS = 5;

@Injectable()
export class DeviceVerificationService {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly sms: SmsService,
    private readonly phones: PhoneService,
  ) {}

  async start(userId: string, device: DeviceInfo, authMethod: string) {
    const challengeId = randomUUID();
    const challenge: Challenge = { userId, device, authMethod, sends: 0, attempts: 0 };
    await this.redis.set(challengeKey(challengeId), JSON.stringify(challenge), 'EX', CHALLENGE_TTL_SEC);
    return { challengeId, expiresInSec: CHALLENGE_TTL_SEC };
  }

  /** 가입한 휴대폰 번호로 인증번호 발송 */
  async sendCode(challengeId: string) {
    const challenge = await this.load(challengeId);
    const now = Date.now();
    if (challenge.lastSentAt && now - challenge.lastSentAt < RESEND_AFTER_SEC * 1000) {
      const retryAfterSec = Math.ceil((challenge.lastSentAt + RESEND_AFTER_SEC * 1000 - now) / 1000);
      throw authError(HttpStatus.TOO_MANY_REQUESTS, 'SMS_TOO_SOON', { retryAfterSec });
    }
    if (challenge.sends >= MAX_SENDS_PER_CHALLENGE) throw authError(HttpStatus.TOO_MANY_REQUESTS, 'SMS_LIMIT');

    const today = await this.redis.incr(dailyKey(challenge.userId));
    if (today === 1) await this.redis.expire(dailyKey(challenge.userId), 86_400);
    if (today > MAX_SENDS_PER_DAY) throw authError(HttpStatus.TOO_MANY_REQUESTS, 'SMS_LIMIT');

    // 가입할 때 인증한 번호로 보냅니다 (번호는 PhoneService 만 꺼낼 수 있고 조회 이력이 남습니다)
    const phone = await this.phones.getForSend(challenge.userId, 'sms_device_verify');
    if (!phone && !this.sms.isDev) throw authError(HttpStatus.BAD_REQUEST, 'PHONE_NOT_REGISTERED');
    const code = this.sms.fixedDevCode ?? String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.sms.sendVerificationCode(phone, code, '새 기기 인증');

    Object.assign(challenge, {
      codeHash: this.hashCode(challengeId, code),
      codeExpiresAt: now + CODE_TTL_SEC * 1000,
      lastSentAt: now,
      sends: challenge.sends + 1,
      attempts: 0,
    });
    await this.save(challengeId, challenge);
    return { codeExpiresInSec: CODE_TTL_SEC, resendAfterSec: RESEND_AFTER_SEC, phoneMasked: phone ? maskPhone(phone) : null };
  }

  /** 인증번호 확인. 맞으면 challenge 를 지우고(1회용) 로그인할 사용자·기기 정보를 돌려줍니다 */
  async verify(challengeId: string, code: string) {
    const challenge = await this.load(challengeId);
    if (!challenge.codeHash || !challenge.codeExpiresAt) throw authError(HttpStatus.BAD_REQUEST, 'CODE_NOT_SENT');
    if (Date.now() > challenge.codeExpiresAt) throw authError(HttpStatus.BAD_REQUEST, 'CODE_EXPIRED');

    const expected = Buffer.from(challenge.codeHash);
    const actual = Buffer.from(this.hashCode(challengeId, code));
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      challenge.attempts += 1;
      if (challenge.attempts >= MAX_ATTEMPTS) {
        await this.redis.del(challengeKey(challengeId));
        throw authError(HttpStatus.TOO_MANY_REQUESTS, 'CODE_ATTEMPTS_EXCEEDED');
      }
      await this.save(challengeId, challenge);
      throw authError(HttpStatus.BAD_REQUEST, 'CODE_INVALID', { remainingAttempts: MAX_ATTEMPTS - challenge.attempts });
    }

    // 동시에 두 번 성공 요청이 와도 한 번만 로그인되도록
    const deleted = await this.redis.del(challengeKey(challengeId));
    if (deleted === 0) throw authError(HttpStatus.BAD_REQUEST, 'CHALLENGE_EXPIRED');
    return { userId: challenge.userId, device: challenge.device, authMethod: challenge.authMethod };
  }

  private async load(challengeId: string): Promise<Challenge> {
    const raw = await this.redis.get(challengeKey(challengeId));
    if (!raw) throw authError(HttpStatus.BAD_REQUEST, 'CHALLENGE_EXPIRED');
    return JSON.parse(raw) as Challenge;
  }

  private async save(challengeId: string, challenge: Challenge) {
    // XX: 그 사이 만료됐으면 다시 만들지 않음, KEEPTTL: 남은 시간 유지
    await this.redis.call('SET', challengeKey(challengeId), JSON.stringify(challenge), 'XX', 'KEEPTTL');
  }

  private hashCode(challengeId: string, code: string) {
    return createHash('sha256').update(`${challengeId}:${code}`).digest('hex');
  }
}
