import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import QRCode from 'qrcode';

import { env } from '../config/env.js';

/**
 * 관리자 OTP (Google Authenticator 등 인증 앱의 6자리 숫자, RFC 6238 TOTP).
 *
 * 위치정보사업 신고 [첨부 2] "위치정보시스템에 대한 식별 및 인증": 관제센터에는 아이디·비밀번호에
 * 더해 관리자 본인 폰의 6자리 숫자가 있어야 들어옵니다.
 *
 * 비밀값은 DB 에 암호화해서 둡니다 (AES-256-GCM). 키는 PHONE_ENC_KEY 에서 HKDF 로 OTP 전용 키를 따로 뽑습니다.
 */
export const OTP_ISSUER = 'RamuPin 관제센터';
const STEP_SEC = 30;
const DIGITS = 6;
/** 폰과 서버 시계가 조금 어긋나도 받도록 앞뒤 한 칸(±30초)까지 */
const WINDOW = 1;

const key = Buffer.from(hkdfSync('sha256', Buffer.from(env.PHONE_ENC_KEY, 'base64'), Buffer.alloc(0), 'ramupin-admin-otp-v1', 32));

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | BASE32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 새 비밀값 (160비트, 인증 앱 표준) */
export const generateOtpSecret = (): string => base32Encode(randomBytes(20));

/** 그 30초 칸의 6자리 숫자 */
export function totpAt(secret: string, step: number, digits = DIGITS): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const code = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(code).padStart(digits, '0');
}

/**
 * 입력한 숫자가 맞으면 그 30초 칸 번호를, 틀리면 null.
 * 같은 숫자를 두 번 쓰지 못하게 칸 번호로 막는 것은 부르는 쪽(Redis)이 합니다.
 */
export function verifyTotp(secret: string, code: string, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 1000 / STEP_SEC);
  for (let d = -WINDOW; d <= WINDOW; d++) {
    const expected = Buffer.from(totpAt(secret, current + d));
    if (timingSafeEqual(expected, Buffer.from(code))) return current + d;
  }
  return null;
}

/** 인증 앱에 등록하는 주소 (QR 코드 내용) */
export function otpauthUri(loginId: string, secret: string): string {
  const label = encodeURIComponent(`${OTP_ISSUER}:${loginId}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(OTP_ISSUER)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SEC}`;
}

export const otpQrDataUrl = (loginId: string, secret: string): Promise<string> => QRCode.toDataURL(otpauthUri(loginId, secret), { margin: 1, width: 220 });

/** DB 저장 모양: [iv(12) | tag(16) | 암호문] */
export function encryptOtpSecret(secret: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
}

export function decryptOtpSecret(stored: Buffer): string {
  const decipher = createDecipheriv('aes-256-gcm', key, stored.subarray(0, 12));
  decipher.setAuthTag(stored.subarray(12, 28));
  return Buffer.concat([decipher.update(stored.subarray(28)), decipher.final()]).toString('utf8');
}
