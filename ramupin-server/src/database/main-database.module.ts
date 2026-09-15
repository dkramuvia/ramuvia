import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';

import { env } from '../config/env.js';
import type { MainDatabase } from './main.schema.js';

export const MAIN_DB = Symbol('MAIN_DB');
export type MainDb = Kysely<MainDatabase>;

/**
 * 본 DB 연결 (회원·친구·채팅·정책 등). 모든 모듈에서 주입받을 수 있습니다.
 * 위치 DB 연결은 여기 없고 LocationModule 안에만 있습니다.
 */
@Global()
@Module({
  providers: [
    {
      provide: MAIN_DB,
      useFactory: (): MainDb =>
        new Kysely<MainDatabase>({
          dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: env.MAIN_DATABASE_URL, max: 10 }) }),
        }),
    },
  ],
  exports: [MAIN_DB],
})
export class MainDatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(MAIN_DB) private readonly db: MainDb) {}

  async onApplicationShutdown() {
    await this.db.destroy();
  }
}
