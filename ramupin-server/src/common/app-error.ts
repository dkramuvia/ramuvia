import { BadRequestException, HttpException, type HttpStatus } from '@nestjs/common';
import { z } from 'zod';

/**
 * 앱이 분기할 수 있는 오류: { statusCode, code, message, ...추가정보 }
 * message 는 개발 확인용이고 앱은 code 로 문구를 고릅니다.
 */
export function appError(status: HttpStatus, code: string, message: string, extra?: Record<string, unknown>) {
  return new HttpException({ statusCode: status, code, message, ...extra }, status);
}

/** 요청 본문·쿼리 검사 (실패 시 400) */
export function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new BadRequestException(z.prettifyError(parsed.error));
  return parsed.data;
}
