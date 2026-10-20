import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { encryptCoords } from '../common/location-crypto.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { encryptSosPlace } from '../sos/sos-place.js';
import { LOCATION_DB, type LocationDb } from './location.service.js';

/** 한 번에 옮길 행 수. 서버가 켜진 직후라 다른 요청을 오래 막지 않게 작게 나눕니다 */
const BATCH = 500;

/**
 * 암호화 이전에 평문으로 저장된 좌표를 암호화로 옮기고 평문 칸을 비웁니다
 * (migrations/location/0006, migrations/main/0036 — 위치정보법 기술적 보호조치).
 *
 * 서버가 켜질 때마다 돌지만, 옮길 것이 없으면 조회 네 번으로 끝납니다.
 * 같은 행을 두 번 옮겨도 결과가 같아서 서버가 여러 대여도 괜찮습니다.
 * 평문 칸을 아예 없애는 다음 마이그레이션이 들어가면 이 파일도 지웁니다.
 */
@Injectable()
export class CoordsBackfillService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CoordsBackfillService.name);

  constructor(
    @Inject(LOCATION_DB) private readonly locationDb: LocationDb,
    @Inject(MAIN_DB) private readonly mainDb: MainDb,
  ) {}

  onApplicationBootstrap() {
    // 서버가 뜨는 것을 기다리게 하지 않습니다. 옮기는 동안에도 옛 행은 평문 칸으로 읽힙니다
    void this.run().catch((error: unknown) => this.logger.error(`좌표 암호화 옮기기 실패: ${String(error)}`));
  }

  async run() {
    const counts = {
      points: await this.points(),
      status: await this.status(),
      sos: await this.sos(),
      zoneEvents: await this.zoneEvents(),
    };
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total > 0) this.logger.log(`평문 좌표를 암호화로 옮김: ${JSON.stringify(counts)}`);
    return counts;
  }

  private async points(): Promise<number> {
    let moved = 0;
    for (;;) {
      const rows = await this.locationDb
        .selectFrom('location.location_points')
        .select(['user_id', 'measured_at', 'latitude', 'longitude'])
        .where('coords_enc', 'is', null)
        .where('latitude', 'is not', null)
        .limit(BATCH)
        .execute();
      if (rows.length === 0) return moved;
      await this.locationDb.transaction().execute(async (trx) => {
        for (const r of rows) {
          await trx
            .updateTable('location.location_points')
            .set({
              coords_enc: encryptCoords(Number(r.latitude), Number(r.longitude)),
              latitude: null,
              longitude: null,
              geog: null,
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
      .select(['user_id', 'last_latitude', 'last_longitude', 'fixed_anchor_latitude', 'fixed_anchor_longitude'])
      .where((eb) => eb.or([eb('last_latitude', 'is not', null), eb('fixed_anchor_latitude', 'is not', null)]))
      .execute();
    for (const r of rows) {
      await this.locationDb
        .updateTable('location.user_status')
        .set({
          ...(r.last_latitude != null
            ? {
                last_coords_enc: encryptCoords(r.last_latitude, Number(r.last_longitude)),
              }
            : {}),
          ...(r.fixed_anchor_latitude != null
            ? {
                anchor_coords_enc: encryptCoords(r.fixed_anchor_latitude, Number(r.fixed_anchor_longitude)),
              }
            : {}),
          last_latitude: null,
          last_longitude: null,
          fixed_anchor_latitude: null,
          fixed_anchor_longitude: null,
        })
        .where('user_id', '=', r.user_id)
        .execute();
    }
    return rows.length;
  }

  private async sos(): Promise<number> {
    const rows = await this.mainDb
      .selectFrom('member.sos_events')
      .select(['id', 'latitude', 'longitude', 'altitude', 'place_name', 'place_address'])
      .where('place_enc', 'is', null)
      .where((eb) =>
        eb.or([
          eb('latitude', 'is not', null),
          eb('longitude', 'is not', null),
          eb('altitude', 'is not', null),
          eb('place_name', 'is not', null),
          eb('place_address', 'is not', null),
        ]),
      )
      .execute();
    for (const r of rows) {
      await this.mainDb
        .updateTable('member.sos_events')
        .set({
          place_enc: encryptSosPlace({
            latitude: r.latitude,
            longitude: r.longitude,
            altitude: r.altitude,
            placeName: r.place_name,
            placeAddress: r.place_address,
          }),
          latitude: null,
          longitude: null,
          altitude: null,
          place_name: null,
          place_address: null,
        })
        .where('id', '=', r.id)
        .execute();
    }
    return rows.length;
  }

  private async zoneEvents(): Promise<number> {
    const rows = await this.mainDb
      .selectFrom('member.safe_zone_events')
      .select(['id', 'latitude', 'longitude'])
      .where('coords_enc', 'is', null)
      .where('latitude', 'is not', null)
      .execute();
    for (const r of rows) {
      await this.mainDb
        .updateTable('member.safe_zone_events')
        .set({
          coords_enc: encryptCoords(Number(r.latitude), Number(r.longitude)),
          latitude: null,
          longitude: null,
        })
        .where('id', '=', r.id)
        .execute();
    }
    return rows.length;
  }
}
