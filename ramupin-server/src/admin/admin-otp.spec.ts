import { describe, expect, it } from 'vitest';

import { base32Decode, base32Encode, decryptOtpSecret, encryptOtpSecret, generateOtpSecret, otpauthUri, totpAt, verifyTotp } from './admin-otp.js';

/**
 * 관리자 OTP. 여기서 틀리면 관리자가 관제센터에 아예 못 들어가거나(인증 앱 숫자와 안 맞음),
 * 아무 숫자나 통과합니다.
 */
describe('관리자 OTP (RFC 6238)', () => {
  // RFC 6238 부록 B 시험값: 비밀값 "12345678901234567890", SHA1
  const rfcSecret = base32Encode(Buffer.from('12345678901234567890'));

  it('RFC 6238 시험값과 같은 숫자를 만듭니다', () => {
    expect(totpAt(rfcSecret, Math.floor(59 / 30), 8)).toBe('94287082');
    expect(totpAt(rfcSecret, Math.floor(1111111109 / 30), 8)).toBe('07081804');
    expect(totpAt(rfcSecret, Math.floor(1234567890 / 30), 8)).toBe('89005924');
  });

  it('base32 를 오가도 비밀값이 같습니다', () => {
    const bytes = Buffer.from('12345678901234567890');
    expect(base32Decode(base32Encode(bytes)).equals(bytes)).toBe(true);
    expect(base32Encode(bytes)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  });

  it('지금 칸과 앞뒤 30초 칸의 숫자를 받고, 그 밖은 거절합니다', () => {
    const secret = generateOtpSecret();
    const now = 1_800_000_000_000;
    const step = Math.floor(now / 30000);
    expect(verifyTotp(secret, totpAt(secret, step), now)).toBe(step);
    expect(verifyTotp(secret, totpAt(secret, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(secret, totpAt(secret, step + 1), now)).toBe(step + 1);
    expect(verifyTotp(secret, totpAt(secret, step - 3), now)).toBeNull();
  });

  it('6자리 숫자가 아니면 거절합니다', () => {
    const secret = generateOtpSecret();
    expect(verifyTotp(secret, '12345')).toBeNull();
    expect(verifyTotp(secret, 'abcdef')).toBeNull();
    expect(verifyTotp(secret, '')).toBeNull();
  });

  it('비밀값은 암호화해 저장했다가 그대로 꺼냅니다', () => {
    const secret = generateOtpSecret();
    const stored = encryptOtpSecret(secret);
    expect(stored.toString('latin1')).not.toContain(secret);
    expect(decryptOtpSecret(stored)).toBe(secret);
  });

  it('인증 앱 등록 주소에 발급자와 아이디가 들어갑니다', () => {
    const uri = otpauthUri('ramuadmin', 'ABC');
    expect(uri.startsWith('otpauth://totp/')).toBe(true);
    expect(uri).toContain('secret=ABC');
    expect(decodeURIComponent(uri)).toContain('RamuPin 관제센터:ramuadmin');
  });
});
