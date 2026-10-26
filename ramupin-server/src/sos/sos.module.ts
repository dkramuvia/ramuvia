import { Body, Controller, Get, Inject, Module, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { AuthGuard, CurrentUser, type AuthUser } from '../auth/auth.guard.js';
import { RealtimeModule } from '../chat/chat.gateway.js';
import { parseInput } from '../common/app-error.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { LocationModule } from '../location/location.module.js';
import { PushModule } from '../push/push.module.js';
import { SosSmsService } from './sos-sms.service.js';
import { SosService } from './sos.service.js';

/**
 * SOS (WBS 7.9 / 8.3 / 9.3 / 10.8).
 * 앱은 위치와 녹음만 올리고, 누구에게 어떻게 알릴지는 서버가 정합니다.
 */

const sendBody = z.object({
  startedAt: z.iso.datetime(),
  place: z
    .object({
      placeName: z.string().max(200).nullish(),
      address: z.string().max(300).nullish(),
      latitude: z.number(),
      longitude: z.number(),
    })
    .nullish(),
  altitude: z.number().nullish(),
  /** 녹음 파일. 사진과 같은 방식으로 먼저 올린 뒤 그 id 를 줍니다 */
  audioAssetId: z.uuid().nullish(),
});

const safetyBody = z.object({
  sosEnabled: z.boolean(),
  recipientFriendIds: z.array(z.uuid()).max(50).default([]),
  recipientGroupIds: z.array(z.uuid()).max(50).default([]),
  /** 비회원 연락처 (서버가 문자로 보냄). 보내지 않으면 그대로 둡니다 — 예전 앱이 저장해도 지워지지 않게 */
  contacts: z
    .array(z.object({ name: z.string().trim().min(1).max(20), phone: z.string().max(20) }))
    .max(30)
    .optional(),
  /** 긴급전화 (보완 4.6). 빈 값이면 등록 안 함 */
  emergencyName: z.string().trim().max(20).nullish(),
  emergencyNumber: z
    .string()
    .trim()
    .max(20)
    .regex(/^[0-9+*#\-\s]*$/, '전화번호에는 숫자만 넣어 주세요')
    .nullish(),
  smsEnabled: z.boolean().optional(),
  recordEnabled: z.boolean().optional(),
  longPressStart: z.boolean().optional(),
});

@Controller('sos')
@UseGuards(AuthGuard)
class SosController {
  constructor(
    private readonly sos: SosService,
    private readonly sms: SosSmsService,
  ) {}

  @Post()
  async send(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = parseInput(sendBody, body);
    return this.sos.send(user.id, {
      startedAt: new Date(input.startedAt),
      latitude: input.place?.latitude ?? null,
      longitude: input.place?.longitude ?? null,
      altitude: input.altitude ?? null,
      placeName: input.place?.placeName ?? null,
      placeAddress: input.place?.address ?? null,
      audioAssetId: input.audioAssetId ?? null,
    });
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sos.cancel(user.id, id);
  }

  /** 상황 종료 (안전함) — 받은 사람들에게 안전하다고 알립니다 */
  @Post(':id/resolve')
  resolve(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sos.resolve(user.id, id);
  }

  /** 내가 받은 SOS (알림 보관함) */
  @Get('received')
  received(@CurrentUser() user: AuthUser) {
    return this.sos.received(user.id);
  }

  /** 보낸 사람의 결과 화면: 받은 친구(확인 시각)와 문자(전송 상태) (보완 4.5, C8) */
  @Get(':id/deliveries')
  deliveries(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sms.deliveries(user.id, id);
  }

  /** 실패한 문자 다시 보내기 */
  @Post(':id/sms/:deliveryId/resend')
  resend(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('deliveryId', ParseUUIDPipe) deliveryId: string) {
    return this.sms.resend(user.id, id, deliveryId);
  }
}

@Controller('me/safety')
@UseGuards(AuthGuard)
class SafetyController {
  constructor(
    @Inject(MAIN_DB) private readonly db: MainDb,
    private readonly sms: SosSmsService,
  ) {}

  @Get()
  async get(@CurrentUser() user: AuthUser) {
    const [setting, recipients, contacts] = await Promise.all([
      this.db
        .selectFrom('member.safety_settings')
        .select(['sos_enabled', 'emergency_name', 'emergency_number', 'sms_enabled', 'record_enabled', 'long_press_start'])
        .where('user_id', '=', user.id)
        .executeTakeFirst(),
      this.db.selectFrom('member.sos_recipients').select(['kind', 'target_id']).where('user_id', '=', user.id).execute(),
      this.sms.contacts(user.id),
    ]);
    return {
      // 설정한 적이 없으면 켜진 것으로 봅니다. 안전 기능은 꺼 달라고 해야 꺼집니다
      sosEnabled: setting?.sos_enabled ?? true,
      recipientFriendIds: recipients.filter((r) => r.kind === 'friend').map((r) => r.target_id),
      recipientGroupIds: recipients.filter((r) => r.kind === 'group').map((r) => r.target_id),
      contacts,
      emergencyName: setting?.emergency_name ?? null,
      emergencyNumber: setting?.emergency_number ?? null,
      smsEnabled: setting?.sms_enabled ?? true,
      recordEnabled: setting?.record_enabled ?? true,
      longPressStart: setting?.long_press_start ?? true,
    };
  }

  @Put()
  async update(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = parseInput(safetyBody, body);
    // 보낸 항목만 바꿉니다. 예전 앱은 sosEnabled 와 수신인만 보내므로 나머지를 지우면 안 됩니다
    const patch = {
      sos_enabled: input.sosEnabled,
      ...(input.emergencyNumber !== undefined
        ? { emergency_name: input.emergencyName || null, emergency_number: input.emergencyNumber || null }
        : {}),
      ...(input.smsEnabled !== undefined ? { sms_enabled: input.smsEnabled } : {}),
      ...(input.recordEnabled !== undefined ? { record_enabled: input.recordEnabled } : {}),
      ...(input.longPressStart !== undefined ? { long_press_start: input.longPressStart } : {}),
      updated_at: new Date(),
    };
    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto('member.safety_settings')
        .values({ user_id: user.id, ...patch })
        .onConflict((oc) => oc.column('user_id').doUpdateSet(patch))
        .execute();
      if (input.contacts) await this.sms.replaceContacts(user.id, input.contacts, trx);

      // 통째로 다시 씁니다. 목록이 짧아 지웠다 넣는 편이 단순합니다
      await trx.deleteFrom('member.sos_recipients').where('user_id', '=', user.id).execute();
      const rows = [
        ...input.recipientFriendIds.map((id) => ({ user_id: user.id, kind: 'friend' as const, target_id: id })),
        ...input.recipientGroupIds.map((id) => ({ user_id: user.id, kind: 'group' as const, target_id: id })),
      ];
      if (rows.length > 0) await trx.insertInto('member.sos_recipients').values(rows).execute();
    });
    return { ok: true };
  }
}

@Module({
  // SOS 로 위치를 넘긴 기록을 남기려고 (위치정보 이용·제공사실 확인자료)
  imports: [RealtimeModule, PushModule, LocationModule],
  controllers: [SosController, SafetyController],
  providers: [SosService, SosSmsService],
  exports: [SosService],
})
export class SosModule {}
