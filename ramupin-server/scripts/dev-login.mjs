// 확인용 스크립트들이 같이 쓰는 개발용 로그인.
//
// 새 기기는 문자 인증을 거치는데, 확인 스크립트를 몇 번만 돌려도 하루 발송 한도에 걸립니다.
// 그래서 처음 한 번만 인증하고 받은 기기 키를 파일에 남겨 다음부터 그대로 씁니다
// (앱이 기기에 저장해 두는 것과 같은 방식입니다).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export const API = process.env.RAMUPIN_API ?? 'http://localhost:3000';

const KEY_FILE = new URL('../.dev-device-keys.json', import.meta.url);

export const call = async (method, path, token, body, base = API) => {
  const r = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${text}`);
  return text ? JSON.parse(text) : null;
};

const readKeys = () => (existsSync(KEY_FILE) ? JSON.parse(readFileSync(KEY_FILE, 'utf8')) : {});

/** base 를 주면 그 서버로 로그인합니다 (서버 두 대 확인용) */
export async function login(publicId, base = API) {
  const keys = readKeys();
  const device = {
    installationId: `test-${publicId}-fixed`,
    platform: 'android',
    model: 'test',
    deviceKey: keys[publicId] ?? null,
  };

  let res = await call('POST', '/auth/dev-login', null, { publicId, device }, base);
  if (res.status === 'device_verification_required') {
    await call('POST', '/auth/device-verification/send', null, { challengeId: res.challengeId }, base);
    res = await call('POST', '/auth/device-verification/verify', null, { challengeId: res.challengeId, code: '123456' }, base);
  }

  if (res.deviceKey) writeFileSync(KEY_FILE, JSON.stringify({ ...readKeys(), [publicId]: res.deviceKey }, null, 2));
  res.id = JSON.parse(Buffer.from(res.accessToken.split('.')[1], 'base64url')).sub;
  return res;
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
