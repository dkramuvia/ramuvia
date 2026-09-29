import { Controller, Get, Module, UseGuards } from '@nestjs/common';

import { AuthGuard, CurrentUser, type AuthUser } from '../auth/auth.guard.js';
import { LocationModule } from '../location/location.module.js';
import { FeedService } from './feed.service.js';

/**
 * 지도 메인 바텀시트의 활동 기록 (WBS 9.7).
 * 앱이 지금까지 목업으로 쓰던 `/feed` 를 그대로 씁니다.
 */
@Controller('feed')
@UseGuards(AuthGuard)
class FeedController {
  constructor(private readonly feed: FeedService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.feed.list(user.id);
  }
}

@Module({
  imports: [LocationModule],
  controllers: [FeedController],
  providers: [FeedService],
})
export class FeedModule {}
