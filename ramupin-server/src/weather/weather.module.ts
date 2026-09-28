import { Controller, Get, Inject, Injectable, Logger, Module, Query, UseGuards } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { z } from 'zod';

import { AuthGuard } from '../auth/auth.guard.js';
import { parseInput } from '../common/app-error.js';
import { REDIS } from '../redis/redis.module.js';

/**
 * 지도에 띄울 현재 날씨 (피그마 지도 메인·지도 설정, 2026-09-28판).
 *
 * **왜 서버를 거치나**: 앱이 날씨 회사에 직접 물어보면 나중에 제공처를 바꿀 때
 * 앱을 새로 배포해야 합니다. 서버를 한 겹 두면 주소만 바꾸면 됩니다.
 * 캐시도 서버에 한 번만 두면 되고, 앱마다 따로 부르지 않아 호출 수가 크게 줍니다.
 *
 * **지금 쓰는 곳**: Open-Meteo. 키가 없어도 되고 개발·시험에는 무료입니다.
 * TODO(8단계): 상업 서비스는 기상청 API 로 교체 (키 발급이 외부 승인 항목).
 *   교체할 때 고칠 곳은 이 파일의 `fetchWeather` 하나뿐입니다.
 */

const query = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
});

export interface Weather {
  /** 섭씨. 소수 한 자리 (디자인: "13.9°C") */
  temperature: number;
  /** clear / cloudy / rain / snow / fog / storm — 앱이 아이콘을 고릅니다 */
  condition: string;
}

const API = 'https://api.open-meteo.com/v1/forecast';
const TIMEOUT_MS = 5000;
/**
 * 캐시 시간(초). 날씨는 15분마다 갱신되므로 10분이면 충분합니다.
 * 좌표는 소수 둘째 자리(약 1km)로 잘라, 같은 동네 사람들이 한 번만 부르게 합니다.
 */
const CACHE_SEC = 600;

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async current(latitude: number, longitude: number): Promise<Weather | null> {
    const key = `weather:${latitude.toFixed(2)},${longitude.toFixed(2)}`;
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached) as Weather;

    const weather = await this.fetchWeather(latitude, longitude);
    // 못 가져왔다고 화면이 깨지면 안 됩니다. 날씨는 없어도 되는 정보입니다
    if (!weather) return null;

    await this.redis.set(key, JSON.stringify(weather), 'EX', CACHE_SEC);
    return weather;
  }

  private async fetchWeather(latitude: number, longitude: number): Promise<Weather | null> {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current: 'temperature_2m,weather_code',
      timezone: 'Asia/Seoul',
    });

    try {
      const response = await fetch(`${API}?${params.toString()}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!response.ok) {
        this.logger.warn(`날씨 응답 ${response.status}`);
        return null;
      }
      const data = (await response.json()) as { current?: { temperature_2m?: number; weather_code?: number } };
      const temp = data.current?.temperature_2m;
      if (typeof temp !== 'number') return null;
      return { temperature: Math.round(temp * 10) / 10, condition: conditionOf(data.current?.weather_code) };
    } catch (error) {
      this.logger.warn(`날씨를 가져오지 못했습니다: ${String(error)}`);
      return null;
    }
  }
}

/** WMO 날씨 코드 → 아이콘을 고를 수 있을 만큼만 (세부 구분은 화면에 쓰지 않습니다) */
function conditionOf(code?: number): string {
  if (code == null) return 'clear';
  if (code === 0 || code === 1) return 'clear';
  if (code === 2 || code === 3) return 'cloudy';
  if (code >= 45 && code <= 48) return 'fog';
  if (code >= 71 && code <= 77) return 'snow';
  if (code >= 95) return 'storm';
  if (code >= 51) return 'rain';
  return 'clear';
}

@Controller('weather')
@UseGuards(AuthGuard)
class WeatherController {
  constructor(private readonly weather: WeatherService) {}

  @Get()
  current(@Query() q: unknown) {
    const { latitude, longitude } = parseInput(query, q);
    return this.weather.current(latitude, longitude);
  }
}

@Module({ controllers: [WeatherController], providers: [WeatherService], exports: [WeatherService] })
export class WeatherModule {}
