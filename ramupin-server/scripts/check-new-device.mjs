// 새 기기 로그인·"내가 로그인한 게 아니에요" 확인 (보완 4.21)
//   서버를 띄운 상태에서  node scripts/check-new-device.mjs
// 기기 A 로 로그인한 뒤 기기 B 로 로그인하면 응답에 이전 기기가 오고 A 는 끊기며,
// B 에서 "내가 아니에요" 를 누르면 B 는 끊기고 A 가 되살아나는지 봅니다.
import { call, login } from './dev-login.mjs';

const A = await login('26460002');
console.log('기기 A 로그인 →', (await call('GET', '/me', A.accessToken)).nickname);

const deviceB = { installationId: `test-26460002-other-${Date.now()}`, platform: 'android', model: 'Galaxy B', deviceKey: null };
let res = await call('POST', '/auth/dev-login', null, { publicId: '26460002', device: deviceB });
if (res.status === 'device_verification_required') {
  await call('POST', '/auth/device-verification/send', null, { challengeId: res.challengeId });
  res = await call('POST', '/auth/device-verification/verify', null, { challengeId: res.challengeId, code: '123456' });
}
console.log('기기 B 로그인 → 이전 기기:', JSON.stringify(res.replacedDevice));
if (!res.replacedDevice) throw new Error('이전 기기 정보가 오지 않았습니다');

const aAfter = await call('GET', '/me', A.accessToken).catch((e) => e);
console.log('A 는 끊김 →', aAfter instanceof Error ? aAfter.message.split(' ').slice(2, 3).join(' ') + ' ' + (aAfter.message.includes('SESSION_REPLACED') ? 'SESSION_REPLACED' : '') : '살아 있음(문제)');

const notMe = await call('POST', '/auth/not-me', res.accessToken);
console.log('B 에서 내가 아니에요 →', JSON.stringify(notMe));
const bAfter = await call('GET', '/me', res.accessToken).catch((e) => e);
const aBack = await call('GET', '/me', A.accessToken).catch((e) => e);
console.log('B 는 끊김 →', bAfter instanceof Error, '/ A 되살아남 →', !(aBack instanceof Error));

const ok = notMe.previousRestored && bAfter instanceof Error && !(aBack instanceof Error);
console.log(ok ? '\n통과' : '\n실패');
process.exit(ok ? 0 : 1);
