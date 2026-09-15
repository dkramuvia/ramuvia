import { Module } from '@nestjs/common';

import { AuthModule } from './auth/auth.module.js';
import { MainDatabaseModule } from './database/main-database.module.js';
import { FriendsModule } from './friends/friends.module.js';
import { HealthModule } from './health/health.module.js';
import { LocationModule } from './location/location.module.js';
import { RedisModule } from './redis/redis.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [MainDatabaseModule, RedisModule, AuthModule, LocationModule, UsersModule, FriendsModule, HealthModule],
})
export class AppModule {}
