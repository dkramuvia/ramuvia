import { Controller, Get, HttpStatus, Injectable, Logger, Module, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { AuthGuard } from '../auth/auth.guard.js';
import { appError, parseInput } from '../common/app-error.js';
import { env } from '../config/env.js';

const reverseQuery = z.object({ latitude: z.coerce.number().min(-90).max(90), longitude: z.coerce.number().min(-180).max(180) });
const searchQuery = z.object({
  keyword: z.string().trim().min(1).max(50),
  /** 지금 보고 있는 자리. 주면 가까운 곳부터 보여 줍니다 */
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
});

const NAVER_SEARCH_API = 'https://openapi.naver.com/v1/search/local.json';
/** 네이버 지역 검색이 한 번에 주는 최대 개수 */
const SEARCH_LIMIT = 5;
/** 같은 검색어는 잠시 기억합니다 (하루 호출 한도가 있어서) */
const SEARCH_CACHE_MS = 10 * 60 * 1000;

const NAVER_API = 'https://maps.apigw.ntruss.com';
const TIMEOUT_MS = 5000;

export interface PlaceResult {
  address: string;
  placeName?: string;
  latitude: number;
  longitude: number;
}

/**
 * 주소·장소 (네이버 지도 REST).
 * 앱의 기기 내장 변환으로는 건물 이름이 거의 안 나와서 서버에서 보완합니다 (design-notes 12).
 * ★ Client Secret 은 서버에서만 사용합니다. 앱에는 Client ID 만 들어갑니다.
 * 장소 이름 검색은 네이버 개발자센터의 지역 검색 API 입니다 (지도 키와 다른 곳 — env 설명).
 */
@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);

  get enabled(): boolean {
    return !!env.NAVER_MAP_CLIENT_ID && !!env.NAVER_MAP_CLIENT_SECRET;
  }

  /** 좌표 → 주소 (역지오코딩) */
  async reverse(latitude: number, longitude: number): Promise<PlaceResult> {
    if (!this.enabled) throw appError(HttpStatus.SERVICE_UNAVAILABLE, 'PLACES_DISABLED', '네이버 지도 키가 설정되지 않았습니다');
    const url = `${NAVER_API}/map-reversegeocode/v2/gc?coords=${longitude},${latitude}&output=json&orders=roadaddr,addr`;
    const data = await this.call<NaverReverseResponse>(url);
    const result = data.results?.[0];
    if (!result) throw appError(HttpStatus.NOT_FOUND, 'PLACE_NOT_FOUND', '주소를 찾지 못했습니다');

    const region = result.region;
    const land = result.land;
    const address = [region?.area1?.name, region?.area2?.name, region?.area3?.name, land?.name, land?.number1]
      .filter(Boolean)
      .join(' ');
    return { address, placeName: land?.addition0?.value || undefined, latitude, longitude };
  }

  private readonly searchCache = new Map<string, { at: number; results: PlaceResult[] }>();

  /**
   * 장소 이름 검색 (피그마 갤러리 586 · 사람들2 665 '연관 검색어').
   * 위치를 주면 가까운 순으로 다시 줄 세웁니다 — 네이버는 정확도 순이라 '삼성'을 치면 다른 동네가 먼저 나옵니다.
   */
  async search(keyword: string, near?: { latitude: number; longitude: number }): Promise<PlaceResult[]> {
    const id = env.NAVER_SEARCH_CLIENT_ID || env.NAVER_LOGIN_CLIENT_ID;
    const secret = env.NAVER_SEARCH_CLIENT_SECRET || env.NAVER_LOGIN_CLIENT_SECRET;
    if (!id || !secret) throw appError(HttpStatus.SERVICE_UNAVAILABLE, 'PLACES_DISABLED', '장소 검색 키가 설정되지 않았습니다');

    const cached = this.searchCache.get(keyword);
    let results = cached && Date.now() - cached.at < SEARCH_CACHE_MS ? cached.results : null;
    if (!results) {
      const url = `${NAVER_SEARCH_API}?query=${encodeURIComponent(keyword)}&display=${SEARCH_LIMIT}`;
      let response: Response;
      try {
        response = await fetch(url, {
          headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (error) {
        this.logger.error(`네이버 검색 연결 실패: ${String(error)}`);
        throw appError(HttpStatus.BAD_GATEWAY, 'PLACES_UNAVAILABLE', '장소 검색에 연결하지 못했습니다');
      }
      if (!response.ok) {
        // 024 = 앱에 '검색' API 가 추가되지 않음. 콘솔에서 켜면 됩니다 (env 설명)
        this.logger.error(`네이버 검색 응답 ${response.status}: ${await response.text()}`);
        throw appError(HttpStatus.BAD_GATEWAY, 'PLACES_UNAVAILABLE', '장소를 검색하지 못했습니다');
      }
      const data = (await response.json()) as NaverLocalResponse;
      results = (data.items ?? [])
        .map((item) => ({
          // 제목에 검색어 강조 태그(<b>)가 붙어 옵니다
          placeName: item.title.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&'),
          address: item.roadAddress || item.address,
          // 좌표는 WGS84 를 1천만 배 한 정수입니다
          latitude: Number(item.mapy) / 1e7,
          longitude: Number(item.mapx) / 1e7,
        }))
        .filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude) && r.latitude !== 0);
      this.searchCache.set(keyword, { at: Date.now(), results });
    }
    if (!near) return results;
    const d = (r: PlaceResult) => (r.latitude - near.latitude) ** 2 + ((r.longitude - near.longitude) * Math.cos((near.latitude * Math.PI) / 180)) ** 2;
    return [...results].sort((a, b) => d(a) - d(b));
  }

  private async call<T>(url: string): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          'x-ncp-apigw-api-key-id': env.NAVER_MAP_CLIENT_ID,
          'x-ncp-apigw-api-key': env.NAVER_MAP_CLIENT_SECRET,
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.error(`네이버 지도 연결 실패: ${String(error)}`);
      throw appError(HttpStatus.BAD_GATEWAY, 'PLACES_UNAVAILABLE', '주소 서비스에 연결하지 못했습니다');
    }
    if (!response.ok) {
      this.logger.error(`네이버 지도 응답 ${response.status}: ${await response.text()}`);
      throw appError(HttpStatus.BAD_GATEWAY, 'PLACES_UNAVAILABLE', '주소를 가져오지 못했습니다');
    }
    return (await response.json()) as T;
  }
}

interface NaverLocalResponse {
  items?: { title: string; address: string; roadAddress: string; mapx: string; mapy: string }[];
}

interface NaverReverseResponse {
  results?: {
    region?: { area1?: { name: string }; area2?: { name: string }; area3?: { name: string } };
    land?: { name?: string; number1?: string; addition0?: { value?: string } };
  }[];
}

@Controller('places')
@UseGuards(AuthGuard)
class PlacesController {
  constructor(private readonly places: PlacesService) {}

  /** 좌표 → 주소 */
  @Get('reverse')
  reverse(@Query() query: unknown) {
    const { latitude, longitude } = parseInput(reverseQuery, query);
    return this.places.reverse(latitude, longitude);
  }

  /** 장소 이름 검색 (연관 검색어) */
  @Get('search')
  search(@Query() query: unknown) {
    const { keyword, latitude, longitude } = parseInput(searchQuery, query);
    return this.places.search(keyword, latitude != null && longitude != null ? { latitude, longitude } : undefined);
  }
}

@Module({ controllers: [PlacesController], providers: [PlacesService], exports: [PlacesService] })
export class PlacesModule {}
