import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Redis } from 'ioredis';

import { appError } from '../common/app-error.js';
import { REDIS } from '../redis/redis.module.js';

/**
 * 친구 추가 QR 의 일회용 토큰 (WBS 3.6).
 *
 * **왜 8자리 ID 를 그대로 넣으면 안 되나**: QR 이미지는 한 번 찍히면 영원히 남습니다.
 * 카톡으로 공유한 QR, 단톡방에 올라간 사진, 어깨너머로 찍힌 화면 — 전부 계속 유효합니다.
 * 8자리 ID 는 바꿀 수 없으므로, 한번 새어 나가면 모르는 사람의 친구 요청을 계속 받게 됩니다.
 *
 * **어떻게 바꿨나**
 *   - QR 에는 임의의 토큰만 넣습니다. 사용자 ID 는 들어가지 않습니다
 *   - 3분이 지나면 저절로 못 쓰게 됩니다
 *   - 친구 요청이 한 번 만들어지면 그 토큰은 바로 버립니다
 *
 * **읽는 것만으로는 버리지 않습니다.** 찍고 나서 "아니네" 하고 닫았을 뿐인데
 * 상대가 QR 을 다시 띄워야 한다면 쓰기 불편합니다. 실제로 쓰이는 순간에만 버립니다.
 */

/** 이만큼 지나면 못 씁니다. 눈앞에서 찍는 상황이라 길 이유가 없습니다 */
export const QR_TTL_SEC = 180;

const key = (token: string) => `qr:friend:${token}`;

@Injectable()
export class QrTokenService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /** 내 QR 에 넣을 토큰을 새로 만듭니다 */
  async issue(userId: string): Promise<{ token: string; expiresInSec: number }> {
    const token = randomBytes(16).toString('base64url');
    await this.redis.set(key(token), userId, 'EX', QR_TTL_SEC);
    return { token, expiresInSec: QR_TTL_SEC };
  }

  /** 토큰의 주인. 없거나 시간이 지났으면 거절합니다 */
  async resolve(token: string): Promise<string> {
    const userId = await this.redis.get(key(token));
    if (!userId) throw appError(HttpStatus.NOT_FOUND, 'QR_EXPIRED', 'QR 코드가 만료되었습니다. 상대방에게 다시 보여 달라고 해 주세요');
    return userId;
  }

  /** 친구 요청이 만들어졌으면 버립니다 (일회용) */
  async consume(token: string): Promise<void> {
    await this.redis.del(key(token));
  }
}
