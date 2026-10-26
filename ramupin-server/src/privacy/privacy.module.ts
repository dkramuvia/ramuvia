import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Logger, Module, Put, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { AuthGuard, CurrentUser, type AuthUser } from '../auth/auth.guard.js';
import { parseInput } from '../common/app-error.js';
import { decryptPhone, maskPhone } from '../common/phone.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { LocationModule } from '../location/location.module.js';
import { LocationService } from '../location/location.service.js';

/**
 * 개인정보 센터 (보완 화면 설계 4.13, GDPR · CCPA).
 * 사용자가 자기 데이터를 내려받고, 위치 기록을 지우고, 처리 동의를 바꾸는 곳입니다.
 *
 * - 내려받기: 지금은 요청하면 바로 만들어 줍니다 (화면 문구 "48시간 내" 는 사진·대화가 커질 때를 대비한 약속)
 * - 데이터 보관 지역: 서버가 AWS 서울(ap-northeast-2) 한 곳이라 모두 "대한민국 (서울)" 입니다.
 *   EU 리전 등 나라별 보관은 해외 출시 국가가 정해지면 다시 정합니다 (확정 필요 사항)
 */

const consentBody = z.object({
  adsPersonalized: z.boolean().optional(),
  analytics: z.boolean().optional(),
  marketing: z.boolean().optional(),
  doNotSell: z.boolean().optional(),
});

const deleteQuery = z.object({ range: z.enum(['today', 'week', 'all']) });

/** 지금 서버가 있는 곳 */
const DATA_REGION = { code: 'ap-northeast-2', name: '대한민국 (서울)' };

@Controller('me')
@UseGuards(AuthGuard)
class PrivacyController {
  private readonly logger = new Logger(PrivacyController.name);

  constructor(
    @Inject(MAIN_DB) private readonly db: MainDb,
    private readonly location: LocationService,
  ) {}

  @Get('privacy')
  async get(@CurrentUser() user: AuthUser) {
    const [consent, notification] = await Promise.all([
      this.db.selectFrom('member.privacy_consents').select(['ads_personalized', 'analytics', 'do_not_sell']).where('user_id', '=', user.id).executeTakeFirst(),
      this.db.selectFrom('member.notification_settings').select('marketing').where('user_id', '=', user.id).executeTakeFirst(),
    ]);
    return {
      adsPersonalized: consent?.ads_personalized ?? false,
      analytics: consent?.analytics ?? true,
      marketing: notification?.marketing ?? false,
      doNotSell: consent?.do_not_sell ?? false,
      dataRegion: DATA_REGION,
    };
  }

  /** 동의 바꾸기. 철회는 바로 반영합니다 */
  @Put('privacy')
  async update(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = parseInput(consentBody, body);
    const patch = {
      ...(input.adsPersonalized !== undefined ? { ads_personalized: input.adsPersonalized } : {}),
      ...(input.analytics !== undefined ? { analytics: input.analytics } : {}),
      ...(input.doNotSell !== undefined ? { do_not_sell: input.doNotSell } : {}),
      updated_at: new Date(),
    };
    await this.db
      .insertInto('member.privacy_consents')
      .values({ user_id: user.id, ...patch })
      .onConflict((oc) => oc.column('user_id').doUpdateSet(patch))
      .execute();
    // 마케팅 알림은 알림 설정과 같은 값입니다 (한쪽에서 끄면 다른 쪽도 꺼짐)
    if (input.marketing !== undefined) {
      await this.db
        .insertInto('member.notification_settings')
        .values({ user_id: user.id, marketing: input.marketing })
        .onConflict((oc) => oc.column('user_id').doUpdateSet({ marketing: input.marketing }))
        .execute();
    }
    return this.get(user);
  }

  /**
   * 내 데이터 내려받기 (JSON). 프로필·친구·그룹·장소·안전 설정·보낸 메시지·위치 기록(보관 기간 안).
   * 남의 정보는 넣지 않습니다 (친구는 닉네임과 친구가 된 날만).
   * 내 전화번호는 따로 보관하고 열람 기록을 남기는 곳(phone.service)에서만 다뤄서 여기 넣지 않습니다.
   */
  @Get('data-export')
  async export(@CurrentUser() user: AuthUser) {
    const me = await this.db
      .selectFrom('member.users')
      .select(['public_id', 'nickname', 'gender', 'birth_date', 'plan', 'created_at'])
      .where('id', '=', user.id)
      .executeTakeFirstOrThrow();
    const [friends, groups, places, contacts, messages, history] = await Promise.all([
      this.db
        .selectFrom('social.friendships as f')
        .innerJoin('member.users as u', 'u.id', 'f.friend_id')
        .select(['u.nickname', 'f.created_at'])
        .where('f.user_id', '=', user.id)
        .execute(),
      this.db
        .selectFrom('social.group_members as gm')
        .innerJoin('social.groups as g', 'g.id', 'gm.group_id')
        .select(['g.name', 'g.is_direct', 'gm.role', 'gm.joined_at'])
        .where('gm.user_id', '=', user.id)
        .execute(),
      this.db.selectFrom('member.safe_zones').select(['name', 'address', 'latitude', 'longitude', 'radius_m', 'enabled', 'kind']).where('user_id', '=', user.id).execute(),
      this.db.selectFrom('member.sos_contacts').select(['name', 'phone_encrypted']).where('user_id', '=', user.id).execute(),
      this.db
        .selectFrom('chat.messages')
        .select(['room_id', 'type', 'text', 'created_at'])
        .where('sender_id', '=', user.id)
        .orderBy('created_at')
        .limit(20_000)
        .execute(),
      this.location.exportHistory(user.id),
    ]);
    this.logger.log(`데이터 내려받기 (user ${user.id}): 위치 ${history.length}건, 메시지 ${messages.length}건`);
    return {
      exportedAt: new Date().toISOString(),
      dataRegion: DATA_REGION,
      profile: {
        id: me.public_id,
        nickname: me.nickname,
        gender: me.gender,
        birthDate: me.birth_date,
        plan: me.plan,
        joinedAt: new Date(me.created_at).toISOString(),
      },
      friends: friends.map((f) => ({ nickname: f.nickname, since: new Date(f.created_at).toISOString() })),
      groups: groups.map((g) => ({ name: g.is_direct ? '(1:1 대화)' : g.name, role: g.role, joinedAt: new Date(g.joined_at).toISOString() })),
      places: places.map((p) => ({ name: p.name, address: p.address, latitude: p.latitude, longitude: p.longitude, radiusM: p.radius_m, alerts: p.enabled, kind: p.kind })),
      sosContacts: contacts.map((c) => ({ name: c.name, phone: maskPhone(decryptPhone(c.phone_encrypted)) })),
      sentMessages: messages.map((m) => ({ roomId: m.room_id, type: m.type, text: m.text, at: new Date(m.created_at).toISOString() })),
      locationHistory: history,
    };
  }

  /** 위치 기록 지우기: 오늘 / 최근 7일 / 전체 */
  @Delete('location-history')
  @HttpCode(HttpStatus.OK)
  async deleteHistory(@CurrentUser() user: AuthUser, @Query() query: unknown) {
    const { range } = parseInput(deleteQuery, query);
    const from =
      range === 'all'
        ? null
        : range === 'week'
          ? new Date(Date.now() - 7 * 86_400_000)
          : new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }) + 'T00:00:00+09:00');
    const deleted = await this.location.deleteHistory(user.id, from);
    this.logger.warn(`위치 기록 지움 (user ${user.id}, ${range}): ${deleted}건`);
    return { deleted };
  }
}

@Module({
  imports: [LocationModule],
  controllers: [PrivacyController],
})
export class PrivacyModule {}
