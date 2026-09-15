import { BadRequestException, Body, Controller, ForbiddenException, Global, Inject, Module, NotFoundException, Post } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { z } from 'zod';

import { env } from '../config/env.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { AuthGuard } from './auth.guard.js';

const devLoginBody = z.object({ publicId: z.string().min(1) });

/**
 * TODO(가입·로그인은 마지막 단계): 소셜 로그인 토큰 검증, SMS 인증, refresh token
 * 지금은 개발용 로그인만: 시드 사용자의 8자리 ID 로 JWT 발급
 */
@Controller('auth')
class AuthController {
  constructor(
    @Inject(MAIN_DB) private readonly db: MainDb,
    private readonly jwt: JwtService,
  ) {}

  @Post('dev-login')
  async devLogin(@Body() body: unknown) {
    if (!env.DEV_LOGIN_ENABLED) throw new ForbiddenException('개발용 로그인이 꺼져 있습니다');
    const parsed = devLoginBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException(z.prettifyError(parsed.error));

    const user = await this.db
      .selectFrom('member.users')
      .select(['id', 'public_id', 'nickname'])
      .where('public_id', '=', parsed.data.publicId)
      .executeTakeFirst();
    if (!user) throw new NotFoundException('사용자가 없습니다. npm run db:seed 를 실행했는지 확인하세요');

    const accessToken = await this.jwt.signAsync({ sub: user.id });
    return { accessToken, user: { id: user.id, publicId: user.public_id, nickname: user.nickname } };
  }
}

@Global()
@Module({
  imports: [JwtModule.register({ secret: env.JWT_SECRET, signOptions: { expiresIn: env.JWT_EXPIRES_IN as never } })],
  controllers: [AuthController],
  providers: [AuthGuard],
  exports: [AuthGuard, JwtModule],
})
export class AuthModule {}
