import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * 관리자 비밀번호 해시 (scrypt).
 *
 * 외부 라이브러리를 쓰지 않습니다. Node 기본 scrypt 는 메모리를 많이 쓰도록 설계돼 있어
 * GPU 로 몰아치는 공격에 강합니다. 형식: scrypt$N$r$p$salt$hash
 */

const N = 16384;
const R = 8;
const P = 1;
const KEY_LEN = 32;

function derive(password: string, salt: Buffer, keyLen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, keyLen, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, KEY_LEN, { N, r: R, p: P });
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt') return false;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  const key = await derive(password, salt, expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  // 길이가 다르면 timingSafeEqual 이 예외를 던집니다
  return key.length === expected.length && timingSafeEqual(key, expected);
}
