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
  Res,
  UseGuards,
} from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import type { Response } from 'express';
import { z } from 'zod';

import { parseInput } from '../common/app-error.js';
import { env } from '../config/env.js';
import { MAIN_DB, type MainDb } from '../database/main-database.module.js';
import { authError } from './auth-error.js';
import { AuthGuard, CurrentUser, type AuthUser } from './auth.guard.js';
import { DeviceVerificationService } from './device-verification.service.js';
import { GoogleService } from './google.service.js';
import { KakaoService } from './kakao.service.js';
import { NaverService } from './naver.service.js';
import { XService } from './x.service.js';
import { SignUpService, type SocialIdentity } from './sign-up.service.js';
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
// X 는 토큰이 아니라 인가 코드를 받습니다. 토큰 교환은 서버가 직접 합니다 (x.service.ts 설명 참고)
/** 앱을 여는 주소. app.json 의 scheme 과 같아야 합니다 */
const APP_SCHEME = 'ramupin';

const naverCallbackQuery = z.object({
  code: z.string().max(500).optional(),
  state: z.string().max(200).optional(),
  error: z.string().max(100).optional(),
  error_description: z.string().max(300).optional(),
});

// 네이버는 PKCE 대신 state 로 흐름을 맞춥니다 (앱이 만든 임의 값이 그대로 돌아왔는지 앱에서 확인)
const naverLoginBody = z.object({
  code: z.string().min(1).max(500),
  state: z.string().min(1).max(200),
  redirectUri: z.string().url().max(200),
  device: deviceSchema,
});
const googleLoginBody = z.object({
  code: z.string().min(10).max(1000),
  codeVerifier: z.string().min(43).max(128),
  redirectUri: z.string().max(200),
  device: deviceSchema,
});
const xLoginBody = z.object({
  code: z.string().min(10).max(500),
  codeVerifier: z.string().min(43).max(128),
  redirectUri: z.string().url().max(200),
  device: deviceSchema,
});
/**
 * 휴대폰 인증번호 요청.
 *
 * `country` 는 인증 화면에서 고른 국가입니다 (ISO 3166-1 alpha-2). 가입자의 국가로
 * 그대로 저장되어 관리자 관제센터의 국가별 집계에 쓰입니다 (2026-10-06 결정).
 *
 * **번호 형식은 국가에 따라 달리 봅니다.** 한국은 `010-1234-5678` 형태를 그대로
 * 확인하고, 그 밖의 국가는 자릿수만 봅니다 — 나라마다 규칙이 달라 전부 적어 둘 수
 * 없고, 틀린 번호는 어차피 인증번호가 오지 않아 다음 단계로 못 넘어갑니다.
 */
const signUpSmsBody = z
  .object({
    signUpToken: z.string().min(10),
    phone: z.string().min(4).max(20),
    country: z.string().regex(/^[A-Z]{2}$/, '국가 코드는 대문자 두 글자입니다').default('KR'),
  })
  .refine(
    ({ phone, country }) =>
      country === 'KR' ? /^01[016789][-\s]?\d{3,4}[-\s]?\d{4}$/.test(phone) : /^[\d\s+-]{6,20}$/.test(phone),
    { message: '휴대폰 번호 형식이 아닙니다', path: ['phone'] },
  );
const signUpVerifyBody = z.object({ signUpToken: z.string().min(10), code: z.string().regex(/^\d{6}$/) });
const signUpBody = z.object({
  signUpToken: z.string().min(10),
  nickname: z.string().min(2).max(8),
  gender: z.enum(['male', 'female']),
  birthDate: z.iso.date(),
  // 가입 화면에서 고른 캐릭터. **형식을 고정합니다** — 앱이 보내는 값이라
  // 아무 주소나 받으면 남의 서버 그림을 프로필로 박아 넣을 수 있습니다
  avatarUrl: z
    .string()
    .regex(/^avatar:(boy|girl)-\d{2}$/, '캐릭터 값이 올바르지 않습니다')
    .optional(),
  agreedTerms: z.array(z.string().max(30)).max(10),
  singleHousehold: z.boolean(),
  device: deviceSchema,
});
const nicknameQuery = z.object({ nickname: z.string().min(1).max(20) });
const devSignUpTokenBody = z.object({ providerUserId: z.string().min(1).max(50), nickname: z.string().max(20).nullish() });
const challengeBody = z.object({ challengeId: z.uuid() });
const verifyBody = z.object({ challengeId: z.uuid(), code: z.string().regex(/^\d{6}$/) });
// installationId 는 "같은 기기가 맞는지" 확인용입니다 (session.service.ts refresh 설명 참고).
// 옛 앱 버전은 안 보내므로 선택값입니다
const refreshBody = z.object({
  refreshToken: z.string().min(1).max(200),
  installationId: z.string().min(8).max(100).nullish(),
});

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
    private readonly x: XService,
    private readonly naver: NaverService,
    private readonly google: GoogleService,
    private readonly signUp: SignUpService,
  ) {}

  /** 카카오 로그인: 앱이 카카오 SDK 로 받은 access token 을 서버가 확인 */
  @Post('kakao')
  @HttpCode(HttpStatus.OK)
  async kakaoLogin(@Body() body: unknown): Promise<LoginResult> {
    const { accessToken, device } = parseInput(kakaoLoginBody, body);
    return this.continueWith('kakao', await this.kakao.verify(accessToken), device);
  }

  /**
   * 네이버가 로그인을 마치고 돌아오는 자리.
   *
   * **왜 이 중간 단계가 필요한가**: 카카오·X·구글은 `ramupin://` 같은 앱 주소로 바로
   * 돌려보낼 수 있는데, **네이버는 http(s) 주소만 콜백으로 받습니다.** 그래서 네이버는
   * 여기로 보내고, 여기서 앱으로 넘깁니다. 하는 일은 넘겨받은 값을 그대로 전달하는 것뿐입니다.
   *
   * 로그인 자체와는 무관하므로 토큰도 비밀값도 여기서는 다루지 않습니다.
   * 실제 확인은 앱이 이어서 부르는 `POST /auth/naver` 에서 합니다.
   */
  @Get('naver/callback')
  naverCallback(@Query() query: unknown, @Res() res: Response) {
    const { code, state, error, error_description: detail } = parseInput(naverCallbackQuery, query);
    // 값은 전부 붙여 넣기 전에 인코딩합니다. 주소에 그대로 끼워 넣으면 안 됩니다
    const params = new URLSearchParams(
      code && state ? { code, state } : { error: error ?? 'NAVER_FAILED', ...(detail ? { error_description: detail } : {}) },
    );
    res.redirect(`${APP_SCHEME}://naver-auth?${params.toString()}`);
  }

  /**
   * 네이버 로그인 (WBS 3.6).
   * X 와 같이 앱은 인가 코드만 받아 오고 토큰 교환은 서버가 합니다.
   * 네이버는 PKCE 대신 client secret 을 쓰므로 교환은 반드시 서버에서만 합니다.
   */
  @Post('naver')
  @HttpCode(HttpStatus.OK)
  async naverLogin(@Body() body: unknown): Promise<LoginResult> {
    const { code, state, redirectUri, device } = parseInput(naverLoginBody, body);
    return this.continueWith('naver', await this.naver.verify(code, state, redirectUri), device);
  }

  /** 구글 로그인. 앱은 인가 코드만 받아 오고, 서버가 우리 client_id 로 교환합니다 */
  @Post('google')
  @HttpCode(HttpStatus.OK)
  async googleLogin(@Body() body: unknown): Promise<LoginResult> {
    const { code, codeVerifier, redirectUri, device } = parseInput(googleLoginBody, body);
    return this.continueWith('google', await this.google.verify(code, codeVerifier, redirectUri), device);
  }

  /**
   * 소셜 확인이 끝난 뒤는 어느 제공자든 같습니다.
   * 이미 연결된 계정이면 로그인, 처음이면 가입 흐름으로 넘깁니다.
   */
  private async continueWith(provider: string, social: SocialIdentity, device: DeviceInput): Promise<LoginResult> {
    const account = await this.db
      .selectFrom('member.social_accounts')
      .select('user_id')
      .where('provider', '=', provider)
      .where('provider_user_id', '=', social.providerUserId)
      .executeTakeFirst();
    if (account) return this.login.login(account.user_id, device, provider);

    return { status: 'sign_up_required', ...(await this.signUp.start(provider, social)) };
  }

  /**
   * X(트위터) 로그인.
   * 앱은 인가 코드만 받아 오고, 토큰 교환은 서버가 우리 client_id 로 직접 합니다.
   * X 는 "이 토큰이 우리 앱 것인지" 확인할 방법이 없어서, 교환 성공 자체를 증거로 삼습니다.
   */
  @Post('x')
  @HttpCode(HttpStatus.OK)
  async xLogin(@Body() body: unknown): Promise<LoginResult> {
    const { code, codeVerifier, redirectUri, device } = parseInput(xLoginBody, body);
    return this.continueWith('x', await this.x.verify(code, codeVerifier, redirectUri), device);
  }

  /** 개발용: 카카오 없이 가입 흐름을 시험 (DEV_LOGIN_ENABLED=true 일 때만) */
  @Post('dev-sign-up-token')
  @HttpCode(HttpStatus.OK)
  devSignUpToken(@Body() body: unknown) {
    if (!env.DEV_LOGIN_ENABLED) throw new ForbiddenException('개발용 기능이 꺼져 있습니다');
    const { providerUserId, nickname } = parseInput(devSignUpTokenBody, body);
    return this.signUp.start('dev', { providerUserId, nickname: nickname ?? null, avatarUrl: null });
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
    const { signUpToken, phone, country } = parseInput(signUpSmsBody, body);
    return this.signUp.sendPhoneCode(signUpToken, phone, country);
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
    const { refreshToken, installationId } = parse(refreshBody, body);
    return this.sessions.refresh(refreshToken, installationId);
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
  providers: [
    AuthGuard,
    SessionService,
    SmsService,
    DeviceVerificationService,
    LoginService,
    KakaoService,
    XService,
    NaverService,
    GoogleService,
    SignUpService,
  ],
  exports: [AuthGuard, JwtModule, SessionService, LoginService],
})
export class AuthModule {}
