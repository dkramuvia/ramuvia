import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * 앱이 분기할 수 있도록 인증 오류에는 code 를 붙입니다. 문구는 개발 확인용이고 앱은 code 로 번역합니다.
 * 응답 예: { statusCode: 401, code: 'SESSION_REPLACED', message: '...' }
 */
const MESSAGES = {
  TOKEN_MISSING: '로그인이 필요합니다',
  TOKEN_INVALID: '토큰이 올바르지 않습니다',
  TOKEN_EXPIRED: 'access token 이 만료되었습니다. refresh 하세요',
  SESSION_REPLACED: '다른 기기에서 로그인해 이 기기의 로그인이 끊겼습니다',
  SESSION_REVOKED: '로그아웃된 세션입니다',
  REFRESH_INVALID: 'refresh token 이 올바르지 않습니다',
  REFRESH_EXPIRED: 'refresh token 이 만료되었습니다. 다시 로그인하세요',
  ACCOUNT_INACTIVE: '이용할 수 없는 계정입니다',
  CHALLENGE_EXPIRED: '기기 인증 시간이 지났습니다. 다시 로그인하세요',
  CODE_NOT_SENT: '인증번호를 먼저 요청하세요',
  CODE_EXPIRED: '인증번호 입력 시간이 지났습니다',
  CODE_INVALID: '인증번호가 맞지 않습니다',
  CODE_ATTEMPTS_EXCEEDED: '인증번호를 너무 많이 틀렸습니다. 다시 로그인하세요',
  SMS_TOO_SOON: '잠시 후 다시 요청하세요',
  SMS_LIMIT: '오늘 요청할 수 있는 인증번호 횟수를 넘었습니다',
  PHONE_NOT_REGISTERED: '가입할 때 인증한 휴대폰 번호가 없습니다',
  PHONE_ALREADY_REGISTERED: '이미 가입에 사용된 휴대폰 번호입니다',
  PHONE_NOT_VERIFIED: '휴대폰 인증을 먼저 완료하세요',
  SIGN_UP_TOKEN_INVALID: '가입 정보가 만료되었습니다. 처음부터 다시 진행하세요',
  NICKNAME_TAKEN: '이미 사용 중인 닉네임입니다',
} as const;

export type AuthErrorCode = keyof typeof MESSAGES;

export function authError(status: HttpStatus, code: AuthErrorCode, extra?: Record<string, unknown>) {
  return new HttpException({ statusCode: status, code, message: MESSAGES[code], ...extra }, status);
}
