import { Injectable, Logger } from '@nestjs/common';

import { maskPhone, normalizePhone } from '../common/phone.js';
import { env } from '../config/env.js';

/**
 * 문자 발송.
 *
 * 업체는 **알리고**(<https://smartsms.aligo.in>)입니다. `SMS_PROVIDER` 로 고릅니다.
 *   dev    — 실제로 보내지 않고 로그에만. 인증번호는 123456 고정
 *   aligo  — 실제 발송
 *
 * **키는 서버에만 있습니다.** 앱에 넣으면 공개된 키가 되어 누구나 그 키로 문자를
 * 보낼 수 있고 요금은 우리가 냅니다. 그래서 앱은 "인증번호 보내줘" 만 요청하고
 * 번호와 키는 서버가 다룹니다.
 */

/** 알리고 문자 발송 주소 */
const ALIGO_SEND_URL = 'https://apis.aligo.in/send/';

/** 업체가 늦게 답해도 앱이 하염없이 기다리지 않게 */
const TIMEOUT_MS = 10_000;

/**
 * 알리고 응답.
 * `result_code` 가 1 이면 성공, 0 보다 작으면 실패이고 `message` 에 이유가 옵니다.
 */
interface AligoResponse {
  result_code: number | string;
  message?: string;
  success_cnt?: number;
  error_cnt?: number;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  /** 개발 모드에서는 인증번호가 항상 같습니다 (앱 목업과 동일) */
  get fixedDevCode(): string | null {
    return env.SMS_PROVIDER === 'dev' ? '123456' : null;
  }

  get isDev(): boolean {
    return env.SMS_PROVIDER === 'dev';
  }

  async sendVerificationCode(phone: string | null, code: string, label: string): Promise<void> {
    const text = `[라무핀] 인증번호 ${code}\n3분 안에 입력해 주세요.`;
    await this.send(phone, text, label);
  }

  async send(phone: string | null, text: string, label: string): Promise<void> {
    if (env.SMS_PROVIDER === 'dev') {
      // 개발 중에는 실제로 보내지 않고 로그로만 확인합니다 (번호 원문은 남기지 않음)
      this.logger.log(`[dev 문자] ${label} → ${phone ? maskPhone(phone) : '번호 없음'} : ${text.replace(/\n/g, ' ')}`);
      return;
    }
    if (!phone) throw new Error('문자를 보낼 번호가 없습니다');
    await this.sendViaAligo(phone, text, label);
  }

  /**
   * 알리고로 보냅니다.
   *
   * **로그에 번호 원문과 키를 남기지 않습니다.** 서버 로그는 여러 사람이 보고 오래 남습니다.
   */
  private async sendViaAligo(phone: string, text: string, label: string): Promise<void> {
    const receiver = normalizePhone(phone);
    if (env.NODE_ENV !== 'production' && !this.allowedInDev(receiver)) {
      // 씨드 계정에는 지어낸 번호가 들어 있습니다. 여기서 막지 않으면 확인 스크립트를
      // 돌릴 때마다 모르는 사람에게 문자가 가고 요금도 나갑니다.
      // 조용히 넘기지 않고 던집니다 — 넘기면 "왜 안 왔지" 를 한참 찾게 됩니다
      throw new Error(
        `개발 중에는 ALIGO_ALLOW_NUMBERS 에 적은 번호로만 보냅니다 (${maskPhone(phone)} 은 목록에 없습니다)`,
      );
    }

    const body = new URLSearchParams({
      key: env.ALIGO_API_KEY,
      user_id: env.ALIGO_USER_ID,
      // 발신번호도 숫자만. `.env` 에 "010-1234-5678" 처럼 적어 두면 업체가 거절합니다
      sender: normalizePhone(env.ALIGO_SENDER),
      // 알리고는 숫자만 받습니다 ("010-1234-5678" → "01012345678")
      receiver,
      msg: text,
      // 90바이트가 넘으면 LMS 라 요금이 다릅니다. 인증번호는 짧아 SMS 로 충분합니다
      msg_type: 'SMS',
      testmode_yn: env.ALIGO_TEST_MODE,
    });

    let response: Response;
    try {
      response = await fetch(ALIGO_SEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      // 업체가 죽었거나 느린 경우. 번호는 가린 채로 남깁니다
      this.logger.error(`문자 발송 실패 (${label} → ${maskPhone(phone)}): 업체 연결 ${String(error)}`);
      throw new Error('문자 발송에 실패했습니다');
    }

    if (!response.ok) {
      this.logger.error(`문자 발송 실패 (${label} → ${maskPhone(phone)}): HTTP ${response.status}`);
      throw new Error('문자 발송에 실패했습니다');
    }

    const result = (await response.json()) as AligoResponse;
    // 알리고는 숫자로도 문자열로도 줍니다
    const code = Number(result.result_code);
    if (code !== 1) {
      // `message` 에 "잔액 부족", "발신번호 미등록" 같은 이유가 옵니다. 원인을 찾으려면 남겨야 합니다
      this.logger.error(`문자 발송 거절 (${label} → ${maskPhone(phone)}): [${code}] ${result.message ?? '이유 없음'}`);
      throw new Error('문자 발송에 실패했습니다');
    }

    const mode = env.ALIGO_TEST_MODE === 'Y' ? ' (테스트 모드 — 실제로 가지 않음)' : '';
    this.logger.log(`문자 발송${mode}: ${label} → ${maskPhone(phone)}`);
  }

  /** 개발 중에 이 번호로 실제 문자를 보내도 되는가 */
  private allowedInDev(receiver: string): boolean {
    // `*` = 아무 번호나. 앱 가입 화면에서 여러 번호로 시험할 때 씁니다
    if (env.ALIGO_ALLOW_NUMBERS.trim() === '*') return true;
    return env.ALIGO_ALLOW_NUMBERS.split(',')
      .map((n) => normalizePhone(n))
      .filter((n) => n.length > 0)
      .includes(receiver);
  }
}
