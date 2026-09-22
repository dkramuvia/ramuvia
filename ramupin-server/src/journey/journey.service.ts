import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { appError } from '../common/app-error.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { LocationService } from '../location/location.service.js';
import { PlacesService } from '../places/places.module.js';
import { REDIS } from '../redis/redis.module.js';
import { buildJourney, type Stop } from './stay-detection.js';

/**
 * 하루 여정 (WBS 4.5, 기획 '최근 여정').
 *
 * 앱이 지금까지 목업으로 보여 주던 화면에 실제 데이터를 넣습니다.
 *
 * **공유 설정을 반드시 봅니다.** 친구 목록에 보인다고 이동 경로까지 보여도 되는 것은
 * 아닙니다. 위치 공개(location_level)와 경로 공개(share_route)가 따로 있고, 경로는
 * 별도로 켜야 보입니다. 그리고 누가 누구 위치를 봤는지 남깁니다 (위치정보법).
 */

/** 이 앱은 한국 기준으로 "오늘"을 셉니다. 시간대를 서버 설정에 맡기면 자정 경계가 어긋납니다 */
const KST_OFFSET_MS = 9 * 60 * 60_000;

/**
 * 주소 변환 결과 캐시 시간(초).
 *
 * 역지오코딩은 네이버에 돈을 내고 부르는 것이라, 같은 좌표를 매번 물어보면 안 됩니다.
 * 집·회사처럼 매일 같은 곳이 대부분이므로 캐시가 거의 다 맞습니다.
 */
const ADDRESS_TTL_SEC = 30 * 24 * 60 * 60;

export interface JourneyResponse {
  userId: string;
  date: string;
  totalDistanceM: number;
  stops: (Stop & { placeName?: string; address: string })[];
  route: { kind: 'move' | 'stay'; coordinates: { latitude: number; longitude: number }[] }[];
  batteryLevel?: number;
}

@Injectable()
export class JourneyService {
  private readonly logger = new Logger(JourneyService.name);

  constructor(
    @Inject(MAIN_DB) private readonly db: MainDb,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly location: LocationService,
    private readonly places: PlacesService,
  ) {}

  /**
   * 그 사람의 하루 여정. 볼 수 없는 사이면 null 입니다.
   *
   * 없는 것과 못 보는 것을 굳이 구분하지 않습니다 — 오류로 알려 주면
   * "이 사람은 경로를 안 켰구나" 라는 사실 자체가 새어 나갑니다.
   */
  async today(viewerId: string, targetId: string, date?: string): Promise<JourneyResponse | null> {
    if (viewerId !== targetId && !(await this.canSeeRoute(viewerId, targetId))) return null;

    const { from, to, dateText } = dayRange(date);
    const rows = await this.location.dayPoints(targetId, from, to);
    await this.location.logAccess([targetId], viewerId, 'journey');
    if (rows.length === 0) return { userId: targetId, date: dateText, totalDistanceM: 0, stops: [], route: [] };

    const journey = buildJourney(rows.map((r) => ({ latitude: r.latitude, longitude: r.longitude, measuredAt: r.measured_at })));
    const stops = await Promise.all(journey.stops.map((stop) => this.describe(stop)));

    const status = await this.location.getStatus(targetId);
    return {
      userId: targetId,
      date: dateText,
      totalDistanceM: journey.totalDistanceM,
      stops,
      route: journey.route,
      ...(status?.lastBattery != null ? { batteryLevel: status.lastBattery } : {}),
    };
  }

  /** 이 사람이 나에게 이동 경로를 공개했는지 (친구이면서 경로 공유를 켠 경우만) */
  private async canSeeRoute(viewerId: string, targetId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('social.friend_share_settings')
      .select(['location_level', 'share_route'])
      .where('owner_id', '=', targetId)
      .where('friend_id', '=', viewerId)
      .executeTakeFirst();
    return !!row && row.location_level !== 'hidden' && row.share_route;
  }

  /** 좌표에 주소·건물 이름을 붙입니다. 실패해도 여정은 보여 줍니다 */
  private async describe(stop: Stop): Promise<Stop & { placeName?: string; address: string }> {
    const key = addressKey(stop.latitude, stop.longitude);
    try {
      const cached = await this.redis.get(key);
      if (cached) return { ...stop, ...(JSON.parse(cached) as { placeName?: string; address: string }) };

      if (!this.places.enabled) return { ...stop, address: '' };
      const place = await this.places.reverse(stop.latitude, stop.longitude);
      const described = { address: place.address, ...(place.placeName ? { placeName: place.placeName } : {}) };
      await this.redis.set(key, JSON.stringify(described), 'EX', ADDRESS_TTL_SEC);
      return { ...stop, ...described };
    } catch (error) {
      // 주소를 못 가져왔다고 "오늘 어디 있었나"를 통째로 못 보여 주면 안 됩니다
      this.logger.warn(`주소 변환 실패: ${String(error)}`);
      return { ...stop, address: '' };
    }
  }
}

/**
 * 좌표를 소수 넷째 자리(약 11m)로 잘라 캐시 열쇠로 씁니다.
 * 같은 건물에서 몇 m 흔들린 좌표가 전부 다른 열쇠가 되면 캐시가 소용없습니다.
 */
const addressKey = (latitude: number, longitude: number) => `place:addr:${latitude.toFixed(4)},${longitude.toFixed(4)}`;

/** 'YYYY-MM-DD' (한국 기준) 하루의 시작·끝 */
export function dayRange(date?: string): { from: Date; to: Date; dateText: string } {
  const text = date ?? new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw appError(HttpStatus.BAD_REQUEST, 'BAD_DATE', '날짜 형식이 올바르지 않습니다');
  const from = new Date(`${text}T00:00:00+09:00`);
  return { from, to: new Date(from.getTime() + 24 * 60 * 60_000), dateText: text };
}
