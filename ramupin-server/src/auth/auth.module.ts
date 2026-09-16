import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Global,
  HttpCode,
  HttpStatus,
  Inject,
  Injectable,
  Module,
  NotFoundException,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { z } from 'zod';

import { parseInput } from '../common/app-error.js';
import { env } from '../config/env.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { authError } from './auth-error.js';
import { AuthGuard, CurrentUser, type AuthUser } from './auth.guard.js';
import { DeviceVerificationService } from './device-verification.service.js';
import { KakaoService } from './kakao.service.js';
import { SignUpService } from './sign-up.service.js';
import { SessionService, type DeviceInfo, type NewSession, type TokenPair } from './session.service.js';
import { SmsService } from './sms.service.js';

const deviceSchema = z.object({
  // 앱 설치마다 한 번 만드는 ID (앱 삭제 후 재설치하면 새 기기)
  installationId: z.string().min(8).max(100),
  platform: z.enum(['android', 'ios']),
  model: z.string().max(100).nullish(),
  osVersion: z.string().max(50).nullish(),
  appVersion: z.string().max(30).nullish(),
  // 이전 로그인 때 받은 기기 키 (처음이면 없음)
  deviceKey: z.string().max(100).nullish(),
});

const devLoginBody = z.object({ publicId: z.string().min(1), device: deviceSchema });
const kakaoLoginBody = z.object({ accessToken: z.string().min(10).max(500), device: deviceSchema });
const signUpSmsBody = z.object({ signUpToken: z.string().min(10), phone: z.string().regex(/^01[016789][-\s]?\d{3,4}[-\s]?\d{4}$/, '휴대폰 번호 형식이 아닙니다') });
const signUpVerifyBody = z.object({ signUpToken: z.string().min(10), code: z.string().regex(/^\d{6}$/) });
const signUpBody = z.object({
  signUpToken: z.string().min(10),
  nickname: z.string().min(2).max(8),
  gender: z.enum(['male', 'female']),
  birthDate: z.iso.date(),
  agreedTerms: z.array(z.string().max(30)).max(10),
  singleHousehold: z.boolean(),
  device: deviceSchema,
});
const nicknameQuery = z.object({ nickname: z.string().min(1).max(20) });
const devSignUpTokenBody = z.object({ providerUserId: z.string().min(1).max(50), nickname: z.string().max(20).nullish() });
const challengeBody = z.object({ challengeId: z.uuid() });
const verifyBody = z.object({ challengeId: z.uuid(), code: z.string().regex(/^\d{6}$/) });
const refreshBody = z.object({ refreshToken: z.string().min(1).max(200) });

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new BadRequestException(z.prettifyError(parsed.error));
  return parsed.data;
}

type DeviceInput = DeviceInfo & { deviceKey?: string | null };

export type LoginResult =
  | ({ status: 'ok' } & NewSession)
  | { status: 'device_verification_required'; challengeId: string; expiresInSec: number }
  /** 처음 오는 사람: 가입 화면(프로필·휴대폰 인증·약관)으로 */
  | { status: 'sign_up_required'; signUpToken: string; suggestedNickname: string | null; expiresInSec: number };

/** 모든 로그인 방법(개발용·카카오·네이버...)이 사용자를 찾은 뒤 거치는 공통 단계 */
@Injectable()
export class LoginService {
  constructor(
    @Inject(MAIN_DB) private readonly db: MainDb,
    private readonly sessions: SessionService,
    private readonly verification: DeviceVerificationService,
  ) {}

  async login(userId: string, { deviceKey, ...device }: DeviceInput, authMethod: string): Promise<LoginResult> {
    const user = await this.db.selectFrom('member.users').select('status').where('id', '=', userId).executeTakeFirst();
    if (!user || user.status !== 'active') throw authError(HttpStatus.FORBIDDEN, 'ACCOUNT_INACTIVE');

    if (await this.sessions.needsDeviceVerification(userId, device.installationId, deviceKey)) {
      return { status: 'device_verification_required', ...(await this.verification.start(userId, device, authMethod)) };
    }
    return { status: 'ok', ...(await this.sessions.createSession(userId, device, authMethod, { verified: false })) };
  }
}

/**
 * TODO(가입·로그인은 마지막 단계): 소셜 로그인(카카오 먼저), 가입 시 SMS 인증
 * 지금은 개발용 로그인 + 기기 1대 규칙(새 기기 문자 인증, refresh, 로그아웃)
 */
@Controller('auth')
class AuthController {
  constructor(
    @Inject(MAIN_DB) private readonly db: MainDb,
    private readonly login: LoginService,
    private readonly sessions: SessionService,
    private readonly verification: DeviceVerificationService,
    private readonly kakao: KakaoService,
    private readonly signUp: SignUpService,
  ) {}

  /** 카카오 로그인: 앱이 카카오 SDK 로 받은 access token 을 서버가 확인 */
  @Post('kakao')
  @HttpCode(HttpStatus.OK)
  async kakaoLogin(@Body() body: unknown): Promise<LoginResult> {
    const { accessToken, device } = parseInput(kakaoLoginBody, body);
    const kakaoUser = await this.kakao.verify(accessToken);

    const account = await this.db
      .selectFrom('member.social_accounts')
      .select('user_id')
      .where('provider', '=', 'kakao')
      .where('provider_user_id', '=', kakaoUser.providerUserId)
      .executeTakeFirst();
    if (account) return this.login.login(account.user_id, device, 'kakao');

    return { status: 'sign_up_required', ...(await this.signUp.start('kakao', kakaoUser.providerUserId, kakaoUser.nickname, kakaoUser.avatarUrl)) };
  }

  /** 개발용: 카카오 없이 가입 흐름을 시험 (DEV_LOGIN_ENABLED=true 일 때만) */
  @Post('dev-sign-up-token')
  @HttpCode(HttpStatus.OK)
  devSignUpToken(@Body() body: unknown) {
    if (!env.DEV_LOGIN_ENABLED) throw new ForbiddenException('개발용 기능이 꺼져 있습니다');
    const { providerUserId, nickname } = parseInput(devSignUpTokenBody, body);
    return this.signUp.start('dev', providerUserId, nickname ?? null, null);
  }

  /** 가입 화면: 닉네임 중복 확인 (WBS 3.9) */
  @Get('nickname-check')
  checkNickname(@Query() query: unknown) {
    return this.signUp.checkNickname(parseInput(nicknameQuery, query).nickname);
  }

  /** 가입 중 휴대폰 인증번호 발송. 이미 가입된 번호면 alreadyRegistered=true (WBS 3.7) */
  @Post('sign-up/sms')
  @HttpCode(HttpStatus.OK)
  sendSignUpCode(@Body() body: unknown) {
    const { signUpToken, phone } = parseInput(signUpSmsBody, body);
    return this.signUp.sendPhoneCode(signUpToken, phone);
  }

  @Post('sign-up/sms/verify')
  @HttpCode(HttpStatus.OK)
  verifySignUpCode(@Body() body: unknown) {
    const { signUpToken, code } = parseInput(signUpVerifyBody, body);
    return this.signUp.verifyPhoneCode(signUpToken, code);
  }

  /** 가입 완료 → 회원 생성 + 로그인 */
  @Post('sign-up')
  @HttpCode(HttpStatus.CREATED)
  async completeSignUp(@Body() body: unknown) {
    const { signUpToken, device, ...profile } = parseInput(signUpBody, body);
    return { status: 'ok' as const, ...(await this.signUp.complete(signUpToken, profile, device)) };
  }

  /** 개발용 로그인: 시드 사용자의 8자리 ID (DEV_LOGIN_ENABLED=true 일 때만) */
  @Post('dev-login')
  @HttpCode(HttpStatus.OK)
  async devLogin(@Body() body: unknown): Promise<LoginResult> {
    if (!env.DEV_LOGIN_ENABLED) throw new ForbiddenException('개발용 로그인이 꺼져 있습니다');
    const { publicId, device } = parse(devLoginBody, body);
    const user = await this.db.selectFrom('member.users').select('id').where('public_id', '=', publicId).executeTakeFirst();
    if (!user) throw new NotFoundException('사용자가 없습니다. npm run db:seed 를 실행했는지 확인하세요');
    return this.login.login(user.id, device, 'dev');
  }

  /** 새 기기: 가입한 휴대폰으로 인증번호 발송 (재발송도 같은 API) */
  @Post('device-verification/send')
  @HttpCode(HttpStatus.OK)
  sendCode(@Body() body: unknown) {
    return this.verification.sendCode(parse(challengeBody, body).challengeId);
  }

  /** 새 기기: 인증번호 확인 → 이전 기기 로그인을 끊고 이 기기로 로그인 */
  @Post('device-verification/verify')
  @HttpCode(HttpStatus.OK)
  async verifyCode(@Body() body: unknown): Promise<LoginResult> {
    const { challengeId, code } = parse(verifyBody, body);
    const { userId, device, authMethod } = await this.verification.verify(challengeId, code);
    return { status: 'ok', ...(await this.sessions.createSession(userId, device, authMethod, { verified: true })) };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() body: unknown): Promise<TokenPair> {
    return this.sessions.refresh(parse(refreshBody, body).refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard)
  async logout(@CurrentUser() user: AuthUser) {
    await this.sessions.revoke(user.id, user.sessionId, 'logout');
  }
}

@Global()
@Module({
  imports: [JwtModule.register({ secret: env.JWT_SECRET, signOptions: { expiresIn: env.JWT_EXPIRES_IN as never } })],
  controllers: [AuthController],
  providers: [AuthGuard, SessionService, SmsService, DeviceVerificationService, LoginService, KakaoService, SignUpService],
  exports: [AuthGuard, JwtModule, SessionService, LoginService],
})
export class AuthModule {}
