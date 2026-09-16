import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

import { env } from '../config/env.js';

/**
 * 전화번호 보관 (개인정보).
 * - 원문은 AES-256-GCM 으로 암호화해서 저장 (문자 발송할 때만 복호화)
 * - 중복 가입 확인(WBS 3.7)은 HMAC 해시로 (같은 번호면 같은 값, 원문은 알 수 없음)
 */
const encKey = Buffer.from(env.PHONE_ENC_KEY, 'base64');
const hashKey = Buffer.from(env.PHONE_HASH_KEY, 'base64');

/** "010-1234-5678" → "01012345678" */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function hashPhone(phone: string): string {
  return createHmac('sha256', hashKey).update(normalizePhone(phone)).digest('hex');
}

export function encryptPhone(phone: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encKey, iv);
  const encrypted = Buffer.concat([cipher.update(normalizePhone(phone), 'utf8'), cipher.final()]);
  // [iv(12) | tag(16) | 암호문]
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
}

export function decryptPhone(stored: Buffer): string {
  const iv = stored.subarray(0, 12);
  const tag = stored.subarray(12, 28);
  const decipher = createDecipheriv('aes-256-gcm', encKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(stored.subarray(28)), decipher.final()]).toString('utf8');
}

/** 화면 표시용: 010-****-5678 */
export function maskPhone(phone: string): string {
  const digits = normalizePhone(phone);
  if (digits.length < 9) return digits;
  return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
}
