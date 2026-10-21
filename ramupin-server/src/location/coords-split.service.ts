import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { decryptCoords, decryptLocation, encryptValue } from '../common/location-crypto.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { encryptSosPlace, type SosPlace } from '../sos/sos-place.js';
import { LOCATION_DB, type LocationDb } from './location.service.js';

/** 한 번에 옮길 행 수. 서버가 켜진 직후라 다른 요청을 오래 막지 않게 작게 나눕니다 */
const BATCH = 500;

/**
 * 한 칸에 함께 암호화했던 좌표를 칸마다 따로 암호화해 옮기고, 평문 고도도 암호화합니다
 * (migrations/location/0009, main/0039 — 위치정보사업 신고 [첨부 2] 예시처럼 X·Y 좌표를 각각).
 *
 * 서버가 켜질 때마다 돌지만, 옮길 것이 없으면 조회 네 번으로 끝납니다.
 * 같은 행을 두 번 옮겨도 결과가 같습니다. 옛 칸을 지우는 다음 마이그레이션이 들어가면 이 파일도 지웁니다.
 */
@Injectable()
export class CoordsSplitService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CoordsSplitService.name);

  constructor(
    @Inject(LOCATION_DB) private readonly locationDb: LocationDb,
    @Inject(MAIN_DB) private readonly mainDb: MainDb,
  ) {}

  onApplicationBootstrap() {
    // 서버가 뜨는 것을 기다리게 하지 않습니다. 옮기는 동안에도 옛 행은 한 칸짜리로 읽힙니다
    void this.run().catch((error: unknown) => this.logger.error(`좌표 칸 나누기 실패: ${String(error)}`));
  }

  async run() {
    const counts = { points: await this.points(), status: await this.status(), sos: await this.sos(), zoneEvents: await this.zoneEvents() };
    if (Object.values(counts).some((n) => n > 0)) this.logger.log(`좌표를 칸마다 암호화로 옮김: ${JSON.stringify(counts)}`);
    return counts;
  }

  private async points(): Promise<number> {
    let moved = 0;
    for (;;) {
      const rows = await this.locationDb
        .selectFrom('location.location_points')
        .select(['user_id', 'measured_at', 'coords_enc', 'altitude'])
        .where((eb) => eb.or([eb('coords_enc', 'is not', null), eb('altitude', 'is not', null)]))
        .limit(BATCH)
        .execute();
      if (rows.length === 0) return moved;
      await this.locationDb.transaction().execute(async (trx) => {
        for (const r of rows) {
          const coords = r.coords_enc ? decryptCoords(r.coords_enc) : null;
          await trx
            .updateTable('location.location_points')
            .set({
              ...(coords ? { latitude_enc: encryptValue(coords.latitude), longitude_enc: encryptValue(coords.longitude) } : {}),
              ...(r.altitude != null ? { altitude_enc: encryptValue(r.altitude) } : {}),
              coords_enc: null,
              altitude: null,
            })
            .where('user_id', '=', r.user_id)
            .where('measured_at', '=', r.measured_at)
            .execute();
        }
      });
      moved += rows.length;
    }
  }

  private async status(): Promise<number> {
    const rows = await this.locationDb
      .selectFrom('location.user_status')
      .select(['user_id', 'last_coords_enc', 'anchor_coords_enc'])
      .where((eb) => eb.or([eb('last_coords_enc', 'is not', null), eb('anchor_coords_enc', 'is not', null)]))
      .execute();
    for (const r of rows) {
      const last = r.last_coords_enc ? decryptCoords(r.last_coords_enc) : null;
      const anchor = r.anchor_coords_enc ? decryptCoords(r.anchor_coords_enc) : null;
      await this.locationDb
        .updateTable('location.user_status')
        .set({
          ...(last ? { last_latitude_enc: encryptValue(last.latitude), last_longitude_enc: encryptValue(last.longitude) } : {}),
          ...(anchor ? { anchor_latitude_enc: encryptValue(anchor.latitude), anchor_longitude_enc: encryptValue(anchor.longitude) } : {}),
          last_coords_enc: null,
          anchor_coords_enc: null,
        })
        .where('user_id', '=', r.user_id)
        .execute();
    }
    return rows.length;
  }

  private async sos(): Promise<number> {
    const rows = await this.mainDb.selectFrom('member.sos_events').select(['id', 'place_enc']).where('place_enc', 'is not', null).execute();
    for (const r of rows) {
      const place = decryptLocation<SosPlace>(r.place_enc as Buffer);
      await this.mainDb
        .updateTable('member.sos_events')
        .set({ ...encryptSosPlace(place), place_enc: null })
        .where('id', '=', r.id)
        .execute();
    }
    return rows.length;
  }

  private async zoneEvents(): Promise<number> {
    const rows = await this.mainDb.selectFrom('member.safe_zone_events').select(['id', 'coords_enc']).where('coords_enc', 'is not', null).execute();
    for (const r of rows) {
      const coords = decryptCoords(r.coords_enc as Buffer);
      await this.mainDb
        .updateTable('member.safe_zone_events')
        .set({ latitude_enc: encryptValue(coords.latitude), longitude_enc: encryptValue(coords.longitude), coords_enc: null })
        .where('id', '=', r.id)
        .execute();
    }
    return rows.length;
  }
}

