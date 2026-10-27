import { Controller, Get, Module, Param, ParseUUIDPipe, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';

import { AuthGuard, CurrentUser, type AuthUser } from '../auth/auth.guard.js';
import { parseInput } from '../common/app-error.js';
import { LocationModule } from '../location/location.module.js';
import { PlacesModule } from '../places/places.module.js';
import { HistoryService } from './history.service.js';
import { JourneyService } from './journey.service.js';

/**
 * 이동 기록과 알림 내역 (WBS 4.5, 9.7).
 * 앱이 목업으로 쓰던 `/users/:id/journey/today` 와 `/me/history` 를 실제로 채웁니다.
 */

const journeyQuery = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
const historyQuery = z.object({ category: z.enum(['safety', 'place']).optional() });
const statsQuery = z.object({ days: z.enum(['7', '30']).default('7').transform(Number) });

@Controller('users')
@UseGuards(AuthGuard)
class JourneyController {
  constructor(private readonly journey: JourneyService) {}

  /**
   * 그 사람의 하루 여정. 경로를 공개하지 않은 사이면 null.
   *
   * Nest 는 null 을 돌려주면 본문을 **비워서** 보냅니다(0바이트). 앱은 그걸 빈 글자로 받아
   * "여정이 있다"고 보고 stops 를 읽다가 이동경로 화면이 죽었습니다 (10-21 실기기, 경로 공유를 끈 친구).
   * 그래서 JSON null 을 직접 보냅니다.
   */
  @Get(':userId/journey/today')
  async today(@CurrentUser() user: AuthUser, @Param('userId', ParseUUIDPipe) userId: string, @Query() query: unknown, @Res() response: Response) {
    const { date } = parseInput(journeyQuery, query);
    response.json(await this.journey.today(user.id, userId, date));
  }
}

/** 내 최근 7일·30일 이동 합계 (히스토리 > 장소 기록) */
@Controller('me/journey')
@UseGuards(AuthGuard)
class JourneyStatsController {
  constructor(private readonly journey: JourneyService) {}

  @Get('stats')
  stats(@CurrentUser() user: AuthUser, @Query() query: unknown) {
    const { days } = parseInput(statsQuery, query);
    return this.journey.stats(user.id, days);
  }
}

@Controller('me/history')
@UseGuards(AuthGuard)
class HistoryController {
  constructor(private readonly history: HistoryService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: unknown) {
    const { category } = parseInput(historyQuery, query);
    return this.history.list(user.id, category);
  }
}

@Module({
  imports: [LocationModule, PlacesModule],
  controllers: [JourneyController, JourneyStatsController, HistoryController],
  providers: [JourneyService, HistoryService],
})
export class JourneyModule {}
