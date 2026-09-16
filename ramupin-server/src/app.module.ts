import { Module } from '@nestjs/common';

import { AuthModule } from './auth/auth.module.js';
import { MainDatabaseModule } from './database/main-database.module.js';
import { ChatModule } from './chat/chat.module.js';
import { FriendsModule } from './friends/friends.module.js';
import { GroupsModule } from './groups/groups.module.js';
import { HealthModule } from './health/health.module.js';
import { LocationModule } from './location/location.module.js';
import { PhoneModule } from './phone/phone.module.js';
import { PlacesModule } from './places/places.module.js';
import { RedisModule } from './redis/redis.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [MainDatabaseModule, RedisModule, PhoneModule, AuthModule, LocationModule, UsersModule, FriendsModule, GroupsModule, ChatModule, PlacesModule, HealthModule],
})
export class AppModule {}
