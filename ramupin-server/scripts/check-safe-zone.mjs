// 안심장소 진입·이탈 확인 (WBS 9.4, 보완 4.16·4.17)
//   서버를 띄운 상태에서  node scripts/check-safe-zone.mjs
//
// 지원이 안심장소를 만들고 강한을 지정합니다. 두 방향을 봅니다.
//   1) 지원이 드나들면 강한에게 (지원이 강한에게 "정확" 으로 공유 중)
//   2) 강한이 지원의 장소를 드나들면 지원에게 (강한이 지원에게 "정확" 으로 공유 중)
// 3분 넘게 그 쪽에 있어야 확정하므로, 측정 시각을 과거로 넣어 몇 초 만에 확인합니다.
import { io } from 'socket.io-client';

import { API, call, login, wait } from './dev-login.mjs';

const CENTER = { latitude: 37.4763, longitude: 126.8879 };
const north = (m) => ({ latitude: CENTER.latitude + m / 111_320, longitude: CENTER.longitude });
const T0 = Date.now() - 30 * 60_000;
const at = (minutes) => new Date(T0 + minutes * 60_000).toISOString();

const upload = async (token, meters, minutes) => {
  await call('POST', '/locations', token, { points: [{ ...north(meters), accuracy: 10, battery: 80, measuredAt: at(minutes) }] });
  await wait(1500);
};

const 지원 = await login('26460002'); // 안심장소 주인
const 강한 = await login('26467878'); // 지정한 친구

// 서로 "정확" 으로 공유 (시험 뒤 되돌림)
const before = {
  지원: await call('GET', `/friends/${강한.id}/share-setting`, 지원.accessToken),
  강한: await call('GET', `/friends/${지원.id}/share-setting`, 강한.accessToken),
};
const exact = { locationLevel: 'exact', showStatus: true, shareRoute: false, shareBattery: true };
await call('PUT', `/friends/${강한.id}/share-setting`, 지원.accessToken, exact);
await call('PUT', `/friends/${지원.id}/share-setting`, 강한.accessToken, exact);

const listen = (token, name) => {
  const sock = io(API, { path: '/ws', transports: ['websocket'], auth: { token } });
  const got = [];
  sock.on('geofence', (p) => {
    got.push(p.kind);
    console.log(`  [${name}이 받은 알림] ${p.nickname} ${p.zoneName} ${p.kind === 'enter' ? '도착' : '출발'}`);
  });
  return { sock, got, ready: new Promise((r) => sock.on('ready', r)) };
};
const to강한 = listen(강한.accessToken, '강한');
const to지원 = listen(지원.accessToken, '지원');
await Promise.all([to강한.ready, to지원.ready]);

for (const z of await call('GET', '/geofences', 지원.accessToken)) await call('DELETE', `/geofences/${z.id}`, 지원.accessToken);
const zone = await call('POST', '/geofences', 지원.accessToken, {
  name: '회사',
  center: CENTER,
  radiusM: 300,
  kind: 'work',
  enabled: true,
  notifyFriends: true,
  recipients: [{ friendId: 강한.id, enter: true, leave: false }],
});
console.log(`안심장소: ${zone.name} (${zone.kind}) 반경 ${zone.radiusM}m, 지정 ${JSON.stringify(zone.recipients)}`);

console.log('\n1) 지원이 들어옴 → 3분 뒤에 강한에게');
await upload(지원.accessToken, 800, 0);
await upload(지원.accessToken, 50, 1); // 넘음 (기다림)
await upload(지원.accessToken, 60, 2); // 아직 1분
const early = to강한.got.length;
await upload(지원.accessToken, 70, 5); // 4분 → 확정
console.log(`  3분 전 알림 수: ${early} / 확정 뒤: ${to강한.got.length}`);

console.log('2) 경계에서 잠깐 나갔다 들어옴 → 울리면 안 됨');
await upload(지원.accessToken, 400, 6);
await upload(지원.accessToken, 100, 7);
await upload(지원.accessToken, 100, 11);

console.log('3) 강한이 지원의 장소에 들어옴 → 지원에게 (도착만 켬)');
await upload(강한.accessToken, 900, 0); // 처음 보는 위치: 조용히 "밖" 으로 적음
await upload(강한.accessToken, 40, 2);
await upload(강한.accessToken, 40, 6);
console.log('4) 강한이 나감 → 출발은 꺼 두었으니 울리면 안 됨');
await upload(강한.accessToken, 900, 8);
await upload(강한.accessToken, 900, 12);

const events = await call('GET', '/geofences/events', 지원.accessToken);
console.log('\n지원이 드나든 기록:', events.map((e) => e.kind).join(' → ') || '(없음)');
console.log('강한이 받은 알림:', to강한.got.join(', ') || '(없음)');
console.log('지원이 받은 알림:', to지원.got.join(', ') || '(없음)');

to강한.sock.close();
to지원.sock.close();
for (const z of await call('GET', '/geofences', 지원.accessToken)) await call('DELETE', `/geofences/${z.id}`, 지원.accessToken);
await call('PUT', `/friends/${강한.id}/share-setting`, 지원.accessToken, before.지원);
await call('PUT', `/friends/${지원.id}/share-setting`, 강한.accessToken, before.강한);

const ok = early === 0 && to강한.got.join() === 'enter' && to지원.got.join() === 'enter' && events.map((e) => e.kind).join() === 'enter';
console.log(ok ? '\n통과: 3분 뒤 확정, 경계 흔들림 없음, 친구가 내 장소에 온 것도 알림' : '\n실패');
process.exit(ok ? 0 : 1);
