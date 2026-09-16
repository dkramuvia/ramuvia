import { Injectable, Logger } from '@nestjs/common';

import { maskPhone } from '../common/phone.js';
import { env } from '../config/env.js';

/**
 * 문자 발송. 업체는 대표님이 계약 예정.
 * TODO(문자 업체): 아래 send() 안에서 업체 API 호출로 교체 (발신번호 사전 등록 필요)
 */
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
  }
}
