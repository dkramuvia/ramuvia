import { Controller, Get, Module, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
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

@Controller('users')
@UseGuards(AuthGuard)
class JourneyController {
  constructor(private readonly journey: JourneyService) {}

  /** 그 사람의 하루 여정. 경로를 공개하지 않은 사이면 null */
  @Get(':userId/journey/today')
  today(@CurrentUser() user: AuthUser, @Param('userId', ParseUUIDPipe) userId: string, @Query() query: unknown) {
    const { date } = parseInput(journeyQuery, query);
    return this.journey.today(user.id, userId, date);
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
  controllers: [JourneyController, HistoryController],
  providers: [JourneyService, HistoryService],
})
export class JourneyModule {}
