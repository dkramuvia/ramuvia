// 만 14세 미만 보호자 동의 확인 (보완 4.1)
//   서버(SMS_PROVIDER=dev)를 띄운 상태에서  node scripts/check-guardian.mjs
// 12살이 가입하면 대기 계정이 되고 위치를 받지 않으며, 보호자가 동의 페이지에서 동의하면 active 가 되는지 봅니다.
import { readFileSync } from 'node:fs';

import { API, call } from './dev-login.mjs';

const post = (path, body, token) => call('POST', path, token ?? null, body);
const phone = `0109${String(Date.now()).slice(-7)}`;

const { signUpToken } = await post('/auth/dev-sign-up-token', { providerUserId: `guardian-${Date.now()}`, nickname: '어린이' });
await post('/auth/sign-up/sms', { signUpToken, phone });
await post('/auth/sign-up/sms/verify', { signUpToken, code: '123456' });

const twelve = `${new Date().getFullYear() - 12}-03-02`;
const body = {
  signUpToken,
  nickname: `어린${String(Date.now()).slice(-4)}`,
  gender: 'female',
  birthDate: twelve,
  agreedTerms: ['service'],
  singleHousehold: false,
  device: { installationId: `guardian-${Date.now()}`, platform: 'android', model: 'test' },
};
const noGuardian = await post('/auth/sign-up', body).catch((e) => e);
console.log('보호자 없이 가입 →', noGuardian instanceof Error ? 'GUARDIAN_REQUIRED' : '통과(문제)');

const done = await post('/auth/sign-up', { ...body, guardian: { name: '김은정', phone: '010-5555-1234', sosLink: true } });
const me = await call('GET', '/me', done.accessToken);
console.log('가입 직후 계정 상태 →', me.accountStatus);
const status = await call('GET', '/me/guardian', done.accessToken);
console.log('대기 화면 →', JSON.stringify(status));

const upload = await call('POST', '/locations', done.accessToken, { points: [{ latitude: 37.5, longitude: 127, accuracy: 10, measuredAt: new Date().toISOString() }] });
console.log('대기 중 위치 전송 →', JSON.stringify(upload));

// 보호자 동의 페이지: 토큰은 서버 로그(dev 문자)에서 꺼냅니다
const log = readFileSync(process.env.SRV_LOG ?? '', 'utf8');
const token = [...log.matchAll(/consent\/([A-Za-z0-9_-]{24,64})/g)].at(-1)?.[1];
const pageRes = await fetch(`${API}/consent/${token}`);
console.log('동의 페이지 →', pageRes.status, (await pageRes.text()).includes('동의합니다') ? '버튼 있음' : '버튼 없음');
const agree = await fetch(`${API}/consent/${token}`, { method: 'POST' });
console.log('동의 →', agree.status, (await agree.text()).includes('완료') ? '완료' : '실패');

const after = await call('GET', '/me', done.accessToken);
const safety = await call('GET', '/me/safety', done.accessToken);
console.log('동의 뒤 계정 상태 →', after.accountStatus, '/ SOS 연락처 →', safety.contacts.map((c) => `${c.name} ${c.maskedPhone}`).join(', '));
const ok = noGuardian instanceof Error && me.accountStatus === 'pending_guardian' && upload.received === 0 && after.accountStatus === 'active' && safety.contacts.length === 1;
console.log(ok ? '\n통과' : '\n실패');
process.exit(ok ? 0 : 1);
