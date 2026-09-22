import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';

import { env } from '../config/env.js';
import type { MainDatabase } from './main.schema.js';

/**
 * 날짜(date) 칸을 글자 그대로 읽습니다.
 *
 * 왜 필요한가: pg 는 `date` 를 **서버 시간대의 자정** JS Date 로 바꿉니다.
 * 1990-05-05 가 `1990-05-04T15:00:00Z` 가 되고, 그대로 앱에 내려가면 **하루 전날**로 보입니다.
 * 생년월일은 시각이 없는 값이라 시간대를 끼워 넣을 이유가 없습니다.
 *
 * 1082 = PostgreSQL 의 date 형식 번호입니다.
 */
pg.types.setTypeParser(1082, (value: string) => value);

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
