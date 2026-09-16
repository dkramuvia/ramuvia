import { Controller, Get, HttpStatus, Injectable, Logger, Module, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { AuthGuard } from '../auth/auth.guard.js';
import { appError, parseInput } from '../common/app-error.js';
import { env } from '../config/env.js';

const reverseQuery = z.object({ latitude: z.coerce.number().min(-90).max(90), longitude: z.coerce.number().min(-180).max(180) });
const searchQuery = z.object({ keyword: z.string().min(1).max(50) });

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
 * TODO(8단계): 장소 검색(Search API)은 별도 키 신청 필요, 결과 캐시로 호출 수 줄이기
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

  /** TODO(8단계): 장소 이름 검색 */
  @Get('search')
  search(@Query() query: unknown) {
    parseInput(searchQuery, query);
    throw appError(HttpStatus.NOT_IMPLEMENTED, 'NOT_IMPLEMENTED', '장소 검색은 준비 중입니다');
  }
}

@Module({ controllers: [PlacesController], providers: [PlacesService], exports: [PlacesService] })
export class PlacesModule {}
