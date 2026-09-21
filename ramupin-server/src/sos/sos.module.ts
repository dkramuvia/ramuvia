import { Body, Controller, Get, Inject, Module, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { AuthGuard, CurrentUser, type AuthUser } from '../auth/auth.guard.js';
import { RealtimeModule } from '../chat/chat.gateway.js';
import { parseInput } from '../common/app-error.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { PushModule } from '../push/push.module.js';
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
});

@Controller('sos')
@UseGuards(AuthGuard)
class SosController {
  constructor(private readonly sos: SosService) {}

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

  /** 내가 받은 SOS (알림 보관함) */
  @Get('received')
  received(@CurrentUser() user: AuthUser) {
    return this.sos.received(user.id);
  }
}

@Controller('me/safety')
@UseGuards(AuthGuard)
class SafetyController {
  constructor(@Inject(MAIN_DB) private readonly db: MainDb) {}

  @Get()
  async get(@CurrentUser() user: AuthUser) {
    const [setting, recipients] = await Promise.all([
      this.db.selectFrom('member.safety_settings').select('sos_enabled').where('user_id', '=', user.id).executeTakeFirst(),
      this.db.selectFrom('member.sos_recipients').select(['kind', 'target_id']).where('user_id', '=', user.id).execute(),
    ]);
    return {
      // 설정한 적이 없으면 켜진 것으로 봅니다. 안전 기능은 꺼 달라고 해야 꺼집니다
      sosEnabled: setting?.sos_enabled ?? true,
      recipientFriendIds: recipients.filter((r) => r.kind === 'friend').map((r) => r.target_id),
      recipientGroupIds: recipients.filter((r) => r.kind === 'group').map((r) => r.target_id),
    };
  }

  @Put()
  async update(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = parseInput(safetyBody, body);
    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto('member.safety_settings')
        .values({ user_id: user.id, sos_enabled: input.sosEnabled, updated_at: new Date() })
        .onConflict((oc) => oc.column('user_id').doUpdateSet({ sos_enabled: input.sosEnabled, updated_at: new Date() }))
        .execute();

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
  imports: [RealtimeModule, PushModule],
  controllers: [SosController, SafetyController],
  providers: [SosService],
  exports: [SosService],
})
export class SosModule {}
