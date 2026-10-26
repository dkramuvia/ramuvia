import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Redis } from 'ioredis';

import { env } from '../config/env.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { PushService } from '../push/push.service.js';
import { REDIS } from '../redis/redis.module.js';
import { authError } from './auth-error.js';

export interface DeviceInfo {
  installationId: string;
  platform: 'android' | 'ios';
  model?: string | null;
  osVersion?: string | null;
  appVersion?: string | null;
}

export interface TokenPair {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

/** 이 로그인으로 끊긴 이전 기기 (새 기기 로그인 화면, 보완 4.21) */
export interface ReplacedDevice {
  model: string | null;
  platform: string;
}

export interface NewSession extends TokenPair {
  /** 다른 기기에서 쓰던 계정이면 그 기기. 같은 기기 재로그인·첫 로그인은 없음 */
  replacedDevice?: ReplacedDevice;
  /** 앱이 보안 저장소에 보관했다가 다음 로그인 때 보내는 기기 키 (로그인할 때마다 새로 발급) */
  deviceKey: string;
}

export interface AccessTokenPayload {
  sub: string;
  /** 세션 ID. 가드가 "지금 이 사용자의 활성 세션인지" 매 요청 확인 */
  sid?: string;
}

/** Redis: 사용자별 활성 세션 ID 캐시 (없으면 '-') */
const activeKey = (userId: string) => `auth:active-session:${userId}`;
const NO_SESSION = '-';
/** 로그인·로그아웃이 직접 넣은 값은 오래, DB 에서 읽어 채운 값은 짧게 (동시 로그인 시 옛 값이 남는 시간을 줄임) */
const ACTIVE_CACHE_SEC = 3600;
const ACTIVE_CACHE_FROM_DB_SEC = 60;
/** 응답 유실로 앱이 직전 refresh token 을 다시 보내도 봐주는 시간 */
const REFRESH_GRACE_MS = 60_000;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * 기기 1대 로그인 (대표 요청).
 * - 사용자당 끊기지 않은 세션은 1개 (DB 부분 유니크 인덱스 sessions_one_active_per_user)
 * - 새 세션을 만들면 이전 세션은 revoke_reason='replaced' → 이전 기기는 다음 요청에서 SESSION_REPLACED
 * - 마지막으로 로그인한 기기와 다른 기기면 문자 인증을 먼저 받음 (DeviceVerificationService)
 * - 끊긴 기기에는 바로 푸시로 알리고, 그 기기 푸시 토큰은 지웁니다 (로그아웃된 기기에 내 알림이 가지 않게, 보완 4.21)
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    @Inject(MAIN_DB) private readonly db: MainDb,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly jwt: JwtService,
    private readonly push: PushService,
  ) {}

  /**
   * 문자 인증이 필요한지.
   * 마지막으로 로그인한 기기와 설치 ID·기기 키가 모두 같으면 같은 기기로 봅니다.
   * 한 번도 로그인한 적 없는 계정(가입 직후, 가입 때 이미 문자 인증)은 필요 없음.
   */
  async needsDeviceVerification(userId: string, installationId: string, deviceKey: string | null | undefined): Promise<boolean> {
    const last = await this.db
      .selectFrom('member.devices')
      .select(['installation_id', 'device_key_hash'])
      .where('user_id', '=', userId)
      .where('last_login_at', 'is not', null)
      .orderBy('last_login_at', 'desc')
      .limit(1)
      .executeTakeFirst();
    if (!last) return false;
    if (last.installation_id !== installationId || !deviceKey || !last.device_key_hash) return true;
    return !sameHash(sha256(deviceKey), last.device_key_hash);
  }

  /** 새 세션 발급. 같은 사용자의 이전 세션은 모두 끊습니다 */
  async createSession(userId: string, device: DeviceInfo, authMethod: string, { verified }: { verified: boolean }): Promise<NewSession> {
    const sessionId = randomUUID();
    const refreshToken = `${sessionId}.${randomBytes(32).toString('base64url')}`;
    const refreshExpiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
    const deviceKey = randomBytes(32).toString('base64url');

    const { replaced, oldTokens } = await this.db.transaction().execute(async (trx) => {
      // 같은 사용자가 동시에 두 기기에서 로그인하면 여기서 줄을 섭니다
      await trx.selectFrom('member.users').select('id').where('id', '=', userId).forUpdate().executeTakeFirstOrThrow();
      const now = new Date();

      const deviceRow = await trx
        .insertInto('member.devices')
        .values({
          user_id: userId,
          installation_id: device.installationId,
          device_key_hash: sha256(deviceKey),
          platform: device.platform,
          model: device.model ?? null,
          os_version: device.osVersion ?? null,
          app_version: device.appVersion ?? null,
          verified_at: verified ? now : null,
          last_login_at: now,
          last_seen_at: now,
        })
        .onConflict((oc) =>
          oc.columns(['user_id', 'installation_id']).doUpdateSet((eb) => ({
            device_key_hash: eb.ref('excluded.device_key_hash'),
            platform: eb.ref('excluded.platform'),
            model: eb.ref('excluded.model'),
            os_version: eb.ref('excluded.os_version'),
            app_version: eb.ref('excluded.app_version'),
            last_login_at: now,
            last_seen_at: now,
            ...(verified ? { verified_at: now } : {}),
          })),
        )
        .returning('id')
        .executeTakeFirstOrThrow();

      const revoked = await trx
        .updateTable('member.sessions')
        .set({ revoked_at: now, revoke_reason: 'replaced' })
        .where('user_id', '=', userId)
        .where('revoked_at', 'is', null)
        .returning('device_id')
        .execute();

      await trx
        .insertInto('member.sessions')
        .values({
          id: sessionId,
          user_id: userId,
          device_id: deviceRow.id,
          auth_method: authMethod,
          refresh_token_hash: sha256(refreshToken),
          expires_at: refreshExpiresAt,
        })
        .execute();

      const others = revoked.filter((r) => r.device_id !== deviceRow.id);
      if (others.length === 0) return { replaced: undefined, oldTokens: [] as string[] };
      const old = await trx
        .selectFrom('member.devices')
        .select(['model', 'platform'])
        .where('id', '=', others[0].device_id)
        .executeTakeFirst();
      // 새 기기는 로그인한 뒤에 토큰을 올리므로, 지금 있는 토큰은 이전 기기 것입니다
      const tokens = await trx.selectFrom('member.push_tokens').select('token').where('user_id', '=', userId).execute();
      if (tokens.length) await trx.deleteFrom('member.push_tokens').where('user_id', '=', userId).execute();
      return {
        replaced: { model: old?.model ?? null, platform: old?.platform ?? 'unknown' } as ReplacedDevice,
        oldTokens: tokens.map((t) => t.token),
      };
    });

    await this.cacheActive(userId, sessionId, ACTIVE_CACHE_SEC);
    if (replaced) {
      this.logger.log(`user ${userId}: 다른 기기 세션을 끊고 새 기기로 로그인`);
      await this.push
        .sendToTokens(oldTokens, {
          title: '라무핀',
          body: '다른 기기에서 로그인되어 이 휴대폰의 위치 공유가 중단되었어요',
          channel: 'general',
          data: { kind: 'sessionReplaced' },
        })
        .catch((error: unknown) => this.logger.error(`이전 기기 알림 실패: ${String(error)}`));
    }
    return { ...(await this.issueTokens(userId, sessionId, refreshToken, refreshExpiresAt)), deviceKey, ...(replaced ? { replacedDevice: replaced } : {}) };
  }

  /**
   * "내가 로그인한 게 아니에요" (보완 4.21, 수정 반영본 C10).
   * 새 기기 세션을 끊고, 방금 끊긴 이전 기기 세션을 되살립니다 (이전 기기 유지).
   * 이전 기기가 이미 로그아웃 화면으로 갔다면 되살려도 다시 로그인해야 합니다.
   * 되살리는 것은 30분 안에 끊긴 세션만입니다.
   */
  async notMe(userId: string, sessionId: string) {
    const restored = await this.db.transaction().execute(async (trx) => {
      await trx.selectFrom('member.users').select('id').where('id', '=', userId).forUpdate().executeTakeFirstOrThrow();
      const mine = await trx
        .updateTable('member.sessions')
        .set({ revoked_at: new Date(), revoke_reason: 'logout' })
        .where('id', '=', sessionId)
        .where('user_id', '=', userId)
        .where('revoked_at', 'is', null)
        .returning('device_id')
        .executeTakeFirst();
      if (!mine) return null;
      const previous = await trx
        .selectFrom('member.sessions')
        .select('id')
        .where('user_id', '=', userId)
        .where('revoke_reason', '=', 'replaced')
        .where('revoked_at', '>', new Date(Date.now() - 30 * 60_000))
        .where('device_id', '!=', mine.device_id)
        .where('expires_at', '>', new Date())
        .orderBy('revoked_at', 'desc')
        .executeTakeFirst();
      if (!previous) return null;
      await trx.updateTable('member.sessions').set({ revoked_at: null, revoke_reason: null }).where('id', '=', previous.id).execute();
      return previous.id;
    });
    await this.cacheActive(userId, restored ?? NO_SESSION, ACTIVE_CACHE_SEC);
    this.logger.warn(`user ${userId}: "내가 로그인한 게 아니에요" — 새 기기 끊음${restored ? ', 이전 기기 되살림' : ''}`);
    return { previousRestored: !!restored };
  }

  /**
   * refresh token 으로 새 토큰 발급 (refresh token 도 매번 교체).
   *
   * @param installationId 앱이 보낸 기기 ID. 같은 기기인지 확인하는 데 씁니다.
   *
   * 교체된(옛) 토큰이 다시 오는 경우는 두 가지입니다.
   *   ① 토큰 탈취 — 남이 훔쳐 간 옛 토큰을 쓰는 경우. 세션을 끊어야 합니다
   *   ② 앱이 새 토큰을 저장하기 직전에 죽은 경우 — 강제 종료·배터리 방전.
   *      이때는 잘못이 없는데도 로그아웃됩니다. 위치를 알려야 하는 앱에서는 치명적입니다
   *
   * 둘을 **기기로 구분**합니다. 같은 기기에서 온 옛 토큰이면 ②로 보고 새 토큰을 내줍니다.
   */
  async refresh(refreshToken: string, installationId?: string | null): Promise<TokenPair> {
    const [sessionId, secret] = refreshToken.split('.');
    if (!sessionId || !secret || !UUID_RE.test(sessionId)) throw authError(HttpStatus.UNAUTHORIZED, 'REFRESH_INVALID');

    const session = await this.db
      .selectFrom('member.sessions as s')
      .innerJoin('member.devices as d', 'd.id', 's.device_id')
      .select([
        's.user_id',
        's.refresh_token_hash',
        's.previous_refresh_token_hash',
        's.refreshed_at',
        's.expires_at',
        's.revoked_at',
        's.revoke_reason',
        'd.installation_id',
      ])
      .where('s.id', '=', sessionId)
      .executeTakeFirst();
    if (!session) throw authError(HttpStatus.UNAUTHORIZED, 'REFRESH_INVALID');
    if (session.revoked_at) {
      throw authError(HttpStatus.UNAUTHORIZED, session.revoke_reason === 'replaced' ? 'SESSION_REPLACED' : 'SESSION_REVOKED');
    }
    if (new Date(session.expires_at).getTime() < Date.now()) throw authError(HttpStatus.UNAUTHORIZED, 'REFRESH_EXPIRED');

    const hash = sha256(refreshToken);
    const isCurrent = sameHash(hash, session.refresh_token_hash);
    const isPrevious = !!session.previous_refresh_token_hash && sameHash(hash, session.previous_refresh_token_hash);
    const inGrace = Date.now() - new Date(session.refreshed_at).getTime() < REFRESH_GRACE_MS;

    // 같은 기기에서 왔는지. 앱이 기기 ID 를 안 보내면 확인할 수 없으므로 false
    const sameDevice = !!installationId && installationId === session.installation_id;

    if (!isCurrent && !(isPrevious && (inGrace || sameDevice))) {
      if (isPrevious) {
        // 다른 기기에서 옛 토큰을 씀 → 토큰 탈취로 보고 세션을 끊음
        await this.revoke(session.user_id, sessionId, 'reused');
        this.logger.warn(`user ${session.user_id}: 다른 기기에서 교체된 refresh token 재사용 → 세션 끊음`);
        throw authError(HttpStatus.UNAUTHORIZED, 'SESSION_REVOKED');
      }
      throw authError(HttpStatus.UNAUTHORIZED, 'REFRESH_INVALID');
    }
    if (isPrevious && !inGrace && sameDevice) {
      // 앱이 새 토큰을 저장하기 전에 죽은 경우. 같은 기기라 로그아웃시키지 않습니다
      this.logger.log(`user ${session.user_id}: 같은 기기의 옛 토큰 재사용 → 새 토큰 발급 (앱이 저장 전에 종료된 것으로 봄)`);
    }

    const nextToken = `${sessionId}.${randomBytes(32).toString('base64url')}`;
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
    const updated = await this.db
      .updateTable('member.sessions')
      .set({
        refresh_token_hash: sha256(nextToken),
        // 유예 시간 안의 재시도면 원래 직전 토큰을 유지
        previous_refresh_token_hash: isCurrent ? session.refresh_token_hash : session.previous_refresh_token_hash,
        refreshed_at: new Date(),
        expires_at: expiresAt,
      })
      .where('id', '=', sessionId)
      .where('refresh_token_hash', '=', session.refresh_token_hash)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();
    // 동시에 두 번 refresh 하면 한쪽만 성공
    if (Number(updated.numUpdatedRows) === 0) throw authError(HttpStatus.UNAUTHORIZED, 'REFRESH_INVALID');

    return this.issueTokens(session.user_id, sessionId, nextToken, expiresAt);
  }

  async revoke(userId: string, sessionId: string, reason: 'logout' | 'reused' | 'admin' | 'withdrawn') {
    const result = await this.db
      .updateTable('member.sessions')
      .set({ revoked_at: new Date(), revoke_reason: reason })
      .where('id', '=', sessionId)
      .where('user_id', '=', userId)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();
    // 활성 세션을 끊었을 때만 캐시를 비움 (이미 끊긴 세션이면 현재 활성 세션 캐시를 건드리지 않음)
    if (Number(result.numUpdatedRows) > 0) await this.cacheActive(userId, NO_SESSION, ACTIVE_CACHE_SEC);
  }

  /** 가드에서 매 요청: 이 세션이 지금 이 사용자의 활성 세션인지 */
  async assertActive(userId: string, sessionId: string): Promise<void> {
    let active = await this.redis.get(activeKey(userId)).catch(() => null);
    if (active === null) {
      const row = await this.db
        .selectFrom('member.sessions')
        .select('id')
        .where('user_id', '=', userId)
        .where('revoked_at', 'is', null)
        .where('expires_at', '>', new Date())
        .executeTakeFirst();
      active = row?.id ?? NO_SESSION;
      // NX: 그 사이 로그인이 넣은 최신 값을 덮어쓰지 않음
      await this.redis.set(activeKey(userId), active, 'EX', ACTIVE_CACHE_FROM_DB_SEC, 'NX').catch(() => undefined);
    }
    if (active === sessionId) return;

    const session = await this.db.selectFrom('member.sessions').select('revoke_reason').where('id', '=', sessionId).executeTakeFirst();
    throw authError(HttpStatus.UNAUTHORIZED, session?.revoke_reason === 'replaced' ? 'SESSION_REPLACED' : 'SESSION_REVOKED');
  }

  private async cacheActive(userId: string, value: string, ttlSec: number) {
    await this.redis.set(activeKey(userId), value, 'EX', ttlSec).catch(async (error) => {
      this.logger.error(`active session cache 실패: ${String(error)}`);
      // 옛 값이 남지 않도록 지워서 가드가 DB 로 확인하게 함 (이것도 실패하면 최대 ACTIVE_CACHE_SEC 동안 옛 값)
      await this.redis.del(activeKey(userId)).catch(() => undefined);
    });
  }

  private async issueTokens(userId: string, sessionId: string, refreshToken: string, refreshExpiresAt: Date): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync({ sub: userId, sid: sessionId } satisfies AccessTokenPayload);
    const { exp } = this.jwt.decode<{ exp: number }>(accessToken);
    return {
      accessToken,
      accessTokenExpiresAt: new Date(exp * 1000).toISOString(),
      refreshToken,
      refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
    };
  }
}
