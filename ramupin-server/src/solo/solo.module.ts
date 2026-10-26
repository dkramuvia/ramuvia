import { Body, Controller, Get, HttpStatus, Inject, Injectable, Logger, Module, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { AuthGuard, CurrentUser, type AuthUser } from '../auth/auth.guard.js';
import { SmsService } from '../auth/sms.service.js';
import { appError, parseInput } from '../common/app-error.js';
import { decryptPhone, encryptPhone, maskPhone } from '../common/phone.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { isDomesticMobile } from '../sos/sos-sms.service.js';

/**
 * 1인 가구 안심 모드 (보완 화면 설계 4.2, 수정 반영본 C4).
 *
 * 친구를 등록하지 않은 1인 가구 사용자가 위급할 때 알림을 받을 기관 연락처를 직접 적습니다
 * (기관 목록·계약 기관 선택 방식은 쓰지 않음). 이벤트가 생기면 라무핀 서버가 그 번호로 문자를 보냅니다.
 *
 * 기관에 가는 것: SOS = 정확한 위치 링크 / 움직임 없음 = 알림만 / 배터리 10% 이하 = 알림만 / 평소 위치 = 보내지 않음
 * 서버가 문자를 보내므로 발송 성공 여부는 알 수 있으나, 기관이 읽었는지는 알 수 없습니다 (C11).
 * 친구를 추가해도 안심 모드는 유지되고, 해제는 설정 › 안전 & SOS 에서 합니다.
 */

/** 기관 연락처 최대 개수 (확정 필요 사항 — 우선 3곳) */
export const MAX_AGENCIES = 3;

const soloBody = z.object({
  enabled: z.boolean(),
  inactivityHours: z.union([z.literal(12), z.literal(24), z.literal(48)]).optional(),
  agencies: z
    .array(z.object({ name: z.string().trim().min(1).max(30), phone: z.string().max(20) }))
    .max(MAX_AGENCIES)
    .optional(),
  /** [필수] 위 정보를 연계 기관에 제공하는 데 동의 */
  consent: z.boolean().optional(),
});

@Injectable()
export class SoloService {
  private readonly logger = new Logger(SoloService.name);

  constructor(
    @Inject(MAIN_DB) private readonly db: MainDb,
    private readonly sms: SmsService,
  ) {}

  async get(userId: string) {
    const [user, settings, agencies] = await Promise.all([
      this.db.selectFrom('member.users').select('single_household').where('id', '=', userId).executeTakeFirst(),
      this.db.selectFrom('member.solo_settings').select(['inactivity_hours', 'consented_at']).where('user_id', '=', userId).executeTakeFirst(),
      this.db.selectFrom('member.solo_agencies').select(['id', 'name', 'phone_encrypted']).where('user_id', '=', userId).orderBy('created_at').execute(),
    ]);
    return {
      enabled: user?.single_household ?? false,
      inactivityHours: settings?.inactivity_hours ?? 24,
      consented: !!settings?.consented_at,
      agencies: agencies.map((a) => {
        const phone = decryptPhone(a.phone_encrypted);
        return { id: a.id, name: a.name, phone, maskedPhone: maskPhone(phone) };
      }),
    };
  }

  async update(userId: string, input: z.infer<typeof soloBody>) {
    if (input.enabled) {
      const agencies = input.agencies ?? (await this.get(userId)).agencies;
      if (agencies.length === 0) throw appError(HttpStatus.BAD_REQUEST, 'SOLO_AGENCY_REQUIRED', '기관 연락처를 하나 이상 적어 주세요');
      if (input.consent === false || (input.consent === undefined && !(await this.get(userId)).consented)) {
        throw appError(HttpStatus.BAD_REQUEST, 'SOLO_CONSENT_REQUIRED', '기관에 정보를 제공하는 데 동의해 주세요');
      }
    }
    for (const a of input.agencies ?? []) {
      // 알리고는 국내 휴대폰 번호로만 보냅니다. 기관 일반전화로는 문자가 가지 않습니다
      if (!isDomesticMobile(a.phone)) throw appError(HttpStatus.BAD_REQUEST, 'SOLO_AGENCY_PHONE', `문자를 받을 수 있는 휴대폰 번호를 적어 주세요 (${a.name})`);
    }

    await this.db.transaction().execute(async (trx) => {
      await trx.updateTable('member.users').set({ single_household: input.enabled }).where('id', '=', userId).execute();
      const patch = {
        ...(input.inactivityHours ? { inactivity_hours: input.inactivityHours } : {}),
        ...(input.consent !== undefined ? { consented_at: input.consent ? new Date() : null } : {}),
        updated_at: new Date(),
      };
      await trx
        .insertInto('member.solo_settings')
        .values({ user_id: userId, ...patch })
        .onConflict((oc) => oc.column('user_id').doUpdateSet(patch))
        .execute();
      if (input.agencies) {
        await trx.deleteFrom('member.solo_agencies').where('user_id', '=', userId).execute();
        if (input.agencies.length) {
          await trx
            .insertInto('member.solo_agencies')
            .values(input.agencies.map((a) => ({ user_id: userId, name: a.name, phone_encrypted: encryptPhone(a.phone) })))
            .execute();
        }
      }
    });
    return this.get(userId);
  }

  /** 움직임 없음 기준 시간 (이상징후 단계와 맞춥니다: '12h' / '24h' / '48h') */
  async inactivityStage(userId: string): Promise<string> {
    const row = await this.db.selectFrom('member.solo_settings').select('inactivity_hours').where('user_id', '=', userId).executeTakeFirst();
    return `${row?.inactivity_hours ?? 24}h`;
  }

  /**
   * 기관에 문자를 보냅니다. 안심 모드를 켰고, 동의했고, 연락처가 있을 때만.
   * 실패해도 던지지 않습니다 (SOS·이상징후 처리를 막으면 안 됨). 보낸 곳 수를 돌려줍니다.
   */
  async notifyAgencies(userId: string, text: string, label: string): Promise<number> {
    try {
      const row = await this.db
        .selectFrom('member.users as u')
        .leftJoin('member.solo_settings as s', 's.user_id', 'u.id')
        .select(['u.single_household', 's.consented_at'])
        .where('u.id', '=', userId)
        .executeTakeFirst();
      if (!row?.single_household || !row.consented_at) return 0;
      const agencies = await this.db.selectFrom('member.solo_agencies').select(['phone_encrypted']).where('user_id', '=', userId).execute();
      let sent = 0;
      for (const a of agencies) {
        try {
          await this.sms.send(decryptPhone(a.phone_encrypted), text, label, 'LMS');
          sent += 1;
        } catch (error) {
          this.logger.error(`기관 문자 실패 (${label}): ${String(error)}`);
        }
      }
      return sent;
    } catch (error) {
      this.logger.error(`기관 문자 준비 실패: ${String(error)}`);
      return 0;
    }
  }
}

@Controller('me/solo')
@UseGuards(AuthGuard)
class SoloController {
  constructor(private readonly solo: SoloService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.solo.get(user.id);
  }

  @Put()
  update(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.solo.update(user.id, parseInput(soloBody, body));
  }
}

@Module({
  controllers: [SoloController],
  providers: [SoloService],
  exports: [SoloService],
})
export class SoloModule {}
