// 소셜 로그인 확인 (WBS 3.6, 3.8)
//   서버를 띄운 상태에서  node scripts/check-social-login.mjs
//
// 실제 로그인은 사람이 브라우저에서 눌러야 해서 여기서 끝까지 할 수 없습니다.
// 대신 **사람 없이 확인할 수 있는 것**을 봅니다.
//   1. 키가 없으면 "준비되지 않았습니다", 있으면 가짜 코드를 거절하는지 (어느 쪽이든 500 이면 안 됨)
//   2. 네이버 콜백이 앱으로 제대로 넘기는지
//   3. 잘못된 요청을 400 으로 막는지
//   4. 소셜이 확인해 준 출생연도가 노인 무료 등급으로 이어지는지 (개발용 가입 흐름으로)
import { readFileSync } from 'node:fs';

import pg from 'pg';

import { API, call } from './dev-login.mjs';

const fail = [];
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'O' : 'X'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fail.push(name);
};

/** 오류 응답에서 상태 코드와 code 를 꺼냅니다 */
const post = async (path, body) => {
  const r = await fetch(API + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let parsed = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    /* 본문이 JSON 이 아니면 그대로 둡니다 */
  }
  return { status: r.status, code: parsed.code, message: parsed.message };
};

const device = { installationId: 'check-social-0001', platform: 'android', model: 'test' };

const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const configured = (key) => new RegExp(`^${key}=.+$`, 'm').test(envText);

/**
 * 키가 있으면 "가짜 코드라 거절"(401), 없으면 "준비 안 됨"(503) 이어야 합니다.
 * 어느 쪽이든 500 이 나면 안 됩니다 — 설정이 빠졌을 때 서버가 터지면 원인을 찾기 어렵습니다.
 */
const expectRejected = (name, res, disabledCode, invalidCode, ready) =>
  check(
    `${name} — ${ready ? '가짜 코드는 거절' : '준비 안 됨을 알려 줌'}`,
    ready ? res.status === 401 && res.code === invalidCode : res.status === 503 && res.code === disabledCode,
    `${res.status} ${res.code ?? ''}`,
  );

const naverReady = configured('NAVER_LOGIN_CLIENT_ID') && configured('NAVER_LOGIN_CLIENT_SECRET');
const googleReady = configured('GOOGLE_CLIENT_ID');
console.log(`1) 키 상태 — 네이버 ${naverReady ? '있음' : '없음'} · 구글 ${googleReady ? '있음' : '없음'}`);

const naverRes = await post('/auth/naver', { code: 'x'.repeat(20), state: 'abc', redirectUri: 'http://localhost:3000/auth/naver/callback', device });
expectRejected('네이버', naverRes, 'NAVER_DISABLED', 'NAVER_CODE_INVALID', naverReady);

const googleRes = await post('/auth/google', {
  code: 'x'.repeat(20),
  codeVerifier: 'v'.repeat(43),
  redirectUri: 'com.googleusercontent.apps.test:/oauth',
  device,
});
expectRejected('구글', googleRes, 'GOOGLE_DISABLED', 'GOOGLE_CODE_INVALID', googleReady);

console.log('\n1-2) 네이버 콜백이 앱으로 넘기는지');
const bounce = await fetch(`${API}/auth/naver/callback?code=ABC123&state=xyz`, { redirect: 'manual' });
check('code·state 를 앱 주소로 넘긴다', bounce.headers.get('location') === 'ramupin://naver-auth?code=ABC123&state=xyz', bounce.headers.get('location') ?? '');
const cancelled = await fetch(`${API}/auth/naver/callback?error=access_denied`, { redirect: 'manual' });
check('취소했을 때도 앱으로 돌려보낸다', (cancelled.headers.get('location') ?? '').startsWith('ramupin://naver-auth?error='), cancelled.headers.get('location') ?? '');

console.log('\n2) 잘못된 요청');
const noCode = await post('/auth/naver', { state: 'abc', redirectUri: 'http://localhost:3000/auth/naver/callback', device });
check('필수 값이 빠지면 400', noCode.status === 400, String(noCode.status));

const shortVerifier = await post('/auth/google', { code: 'x'.repeat(20), codeVerifier: 'short', redirectUri: 'a:/b', device });
check('code_verifier 길이를 본다', shortVerifier.status === 400, String(shortVerifier.status));

console.log('\n3) 확인된 출생연도 → 노인 무료 등급');
// 개발용 가입 토큰에는 소셜 확인 연도가 없으므로, 가입 상태에 직접 넣어 확인합니다
const url = /^MIGRATOR_MAIN_URL=(.+)$/m.exec(readFileSync(new URL('../.env', import.meta.url), 'utf8'))[1].trim();
const redisUrl = /^REDIS_URL=(.+)$/m.exec(readFileSync(new URL('../.env', import.meta.url), 'utf8'))[1].trim();
const db = new pg.Client({ connectionString: url });
await db.connect();
const { Redis } = await import('ioredis');
const redis = new Redis(redisUrl);

const PUBLIC_ID_PREFIX = 'check-social';
const started = await call('POST', '/auth/dev-sign-up-token', null, { providerUserId: `${PUBLIC_ID_PREFIX}-${Date.now()}`, nickname: '연령확인' });
check('개발용 가입 토큰 발급', !!started.signUpToken);
check('가입 시작 응답에 확인 연도 칸이 있다', 'verifiedBirthYear' in started, JSON.stringify(started.verifiedBirthYear));

// 가입 상태에 "네이버가 1945년생으로 확인해 줬다" 를 심습니다
const [, payload] = started.signUpToken.split('.');
const stateId = JSON.parse(Buffer.from(payload, 'base64url').toString()).sub;
const raw = await redis.get(`auth:sign-up:${stateId}`);
const state = JSON.parse(raw);
state.provider = 'naver';
state.verifiedBirthYear = 1945;
state.verifiedPhone = `0109${String(Date.now()).slice(-7)}`;
await redis.set(`auth:sign-up:${stateId}`, JSON.stringify(state), 'KEEPTTL');

const nickname = `연령${String(Date.now()).slice(-4)}`;
const signedUp = await call('POST', '/auth/sign-up', null, {
  signUpToken: started.signUpToken,
  nickname,
  gender: 'male',
  // 본인은 1990년생이라고 적었지만, 네이버는 1945년생으로 확인해 줬습니다
  birthDate: '1990-01-01',
  agreedTerms: ['service', 'privacy', 'location'],
  singleHousehold: false,
  device,
});
check('가입 완료', signedUp.status === 'ok');

const row = (await db.query(`SELECT plan, age_verified, birth_date::text AS birth_date FROM member.users WHERE nickname = $1`, [nickname])).rows[0];
console.log(`     등급 ${row?.plan} · 나이 확인 ${row?.age_verified} · 적은 생년월일 ${row?.birth_date}`);
check('적은 값(1990)이 아니라 확인된 연도(1945)로 무료 등급', row?.plan === 'care');
check('나이를 소셜이 확인했다고 기록', row?.age_verified === true);

// 정리
await db.query(`DELETE FROM member.users WHERE nickname = $1`, [nickname]);
await db.end();
await redis.quit();

console.log(fail.length === 0 ? '\n통과: 키가 없어도 안전하게 막히고, 확인된 출생연도가 등급으로 이어집니다' : `\n실패: ${fail.join(', ')}`);
process.exit(fail.length === 0 ? 0 : 1);
