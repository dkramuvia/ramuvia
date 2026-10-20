import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

import { env } from '../config/env.js';

/**
 * 위치정보 저장 암호화 (위치정보법 기술적 보호조치 — 위치정보사업 신고 [첨부 2]).
 *
 * 위도·경도처럼 "그 사람이 언제 어디 있었는지"를 알 수 있는 값은 DB 에 평문으로 두지 않고
 * AES-256-GCM 으로 암호화해 bytea 한 칸에 넣습니다. 화면에 보여 줄 때만 서버에서 풉니다.
 *
 * 키는 LOCATION_ENC_KEY(32바이트 base64). 없으면 PHONE_ENC_KEY 에서 HKDF 로 위치 전용 키를
 * 따로 뽑습니다 — 같은 키를 두 용도로 쓰지 않으면서, 서버에 새 비밀 값을 넣지 않아도 되게.
 * ⚠️ 키를 바꾸면 이미 저장된 위치를 못 읽습니다. 바꿀 때는 다시 암호화하는 작업이 함께 필요합니다.
 */
const key = env.LOCATION_ENC_KEY
  ? Buffer.from(env.LOCATION_ENC_KEY, 'base64')
  : Buffer.from(hkdfSync('sha256', Buffer.from(env.PHONE_ENC_KEY, 'base64'), Buffer.alloc(0), 'ramupin-location-v1', 32));

if (key.length !== 32) throw new Error('LOCATION_ENC_KEY 는 32바이트(base64 44자)여야 합니다');

/** 값 하나를 암호화합니다. 저장 모양: [iv(12) | tag(16) | 암호문] */
export function encryptLocation(value: unknown): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
}

export function decryptLocation<T>(stored: Buffer): T {
  const decipher = createDecipheriv('aes-256-gcm', key, stored.subarray(0, 12));
  decipher.setAuthTag(stored.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(stored.subarray(28)), decipher.final()]).toString('utf8')) as T;
}

export interface Coords {
  latitude: number;
  longitude: number;
}

/** 좌표 한 쌍은 [위도, 경도] 로 짧게 넣습니다 (위치 이력은 하루 수천 건이라 크기가 쌓입니다) */
export const encryptCoords = (latitude: number, longitude: number): Buffer => encryptLocation([latitude, longitude]);

export function decryptCoords(stored: Buffer): Coords {
  const [latitude, longitude] = decryptLocation<[number, number]>(stored);
  return { latitude, longitude };
}
