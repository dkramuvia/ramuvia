// SOS 확인 (WBS 7.9 / 9.3)
//   서버를 띄운 상태에서  node scripts/check-sos.mjs
// 지원이 SOS 를 누르면 지정한 강한에게 즉시 닿는지, 취소도 닿는지, 목록에 남는지 봅니다
import { io } from 'socket.io-client';

import { API, call, login, wait } from './dev-login.mjs';

const 지원 = await login('26460002'); // SOS 를 누르는 사람
const 강한 = await login('26467878'); // 받는 사람

// 1) 안전 설정: 강한을 수신인으로
await call('PUT', '/me/safety', 지원.accessToken, {
  sosEnabled: true,
  recipientFriendIds: [강한.id],
  recipientGroupIds: [],
});
const safety = await call('GET', '/me/safety', 지원.accessToken);
console.log('안전 설정 저장 →', JSON.stringify(safety));
if (safety.recipientFriendIds.length !== 1) throw new Error('수신인이 저장되지 않았습니다');

const sock = io(API, { path: '/ws', transports: ['websocket'], auth: { token: 강한.accessToken } });
const got = [];
sock.on('sos', (p) => {
  got.push(p);
  console.log(`  [강한이 받음] ${p.status === 'cancelled' ? 'SOS 취소' : `${p.nickname}님의 SOS — ${p.placeName ?? p.placeAddress}`}`);
});
await new Promise((r) => sock.on('ready', r));

// 2) SOS 발신
const sent = await call('POST', '/sos', 지원.accessToken, {
  startedAt: new Date().toISOString(),
  place: { placeName: '부평역 3번 출구', address: '인천 부평구', latitude: 37.4894, longitude: 126.7244 },
  altitude: null,
  audioAssetId: null,
});
console.log(`\nSOS 발신 → 받은 사람 ${sent.recipientCount}명, 회사 접수 ${sent.toMonitoring}`);
await wait(1500);

// 3) 받은 목록
const received = await call('GET', '/sos/received', 강한.accessToken);
console.log('강한의 받은 SOS 목록:', received.length, '건 · 맨 위:', received[0]?.nickname, received[0]?.status);

// 4) 취소
await call('POST', `/sos/${sent.sosId}/cancel`, 지원.accessToken);
await wait(1500);
const afterCancel = await call('GET', '/sos/received', 강한.accessToken);
console.log('취소 후 상태:', afterCancel.find((s) => s.id === sent.sosId)?.status);

sock.close();
const ok =
  sent.recipientCount === 1 &&
  got.length === 2 &&
  got[0].nickname &&
  got[1].status === 'cancelled' &&
  received.some((s) => s.id === sent.sosId) &&
  afterCancel.find((s) => s.id === sent.sosId)?.status === 'cancelled';
console.log(ok ? '\n통과: 발신·수신·목록·취소가 모두 이어집니다' : '\n실패');
process.exit(ok ? 0 : 1);
