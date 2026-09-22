// 안심장소 진입·이탈 확인 (WBS 9.4)
//   서버를 띄운 상태에서  node scripts/check-safe-zone.mjs
// 지원이 안심장소를 만들고, 그 안으로 들어갔다 나올 때 강한에게 알림이 가는지 봅니다
import { io } from 'socket.io-client';

import { API, call, login, wait } from './dev-login.mjs';

const CENTER = { latitude: 37.4763, longitude: 126.8879 };
const north = (m) => ({ latitude: CENTER.latitude + m / 111_320, longitude: CENTER.longitude });

const upload = (token, coords) =>
  call('POST', '/locations', token, {
    points: [{ ...coords, accuracy: 10, battery: 80, measuredAt: new Date().toISOString() }],
  });

const 지원 = await login('26460002'); // 안심장소 주인
const 강한 = await login('26467878'); // 알림 받는 친구

// 베이직 등급은 진입·이탈 알림이 0명이라(0001_init.sql) 시험용으로 등급을 올려 둡니다
const { readFileSync } = await import('node:fs');
const pg = (await import('pg')).default;
const db = new pg.Client({ connectionString: /^MIGRATOR_MAIN_URL=(.+)$/m.exec(readFileSync(new URL('../.env', import.meta.url), 'utf8'))[1].trim() });
await db.connect();
const before = (await db.query('SELECT plan FROM member.users WHERE id = $1', [지원.id])).rows[0].plan;
await db.query('UPDATE member.users SET plan = $1 WHERE id = $2', ['platinum', 지원.id]);
console.log(`지원 등급: ${before} → platinum (시험용)`);

const sock = io(API, { path: '/ws', transports: ['websocket'], auth: { token: 강한.accessToken } });
const alerts = [];
sock.on('geofence', (p) => {
  alerts.push(p);
  console.log(`  [강한이 받은 알림] ${p.nickname} ${p.zoneName} ${p.kind === 'enter' ? '도착' : '이탈'}`);
});
await new Promise((r) => sock.on('ready', r));

// 이전 실행에서 남은 것 정리
for (const z of await call('GET', '/geofences', 지원.accessToken)) {
  await call('DELETE', `/geofences/${z.id}`, 지원.accessToken);
}

const zone = await call('POST', '/geofences', 지원.accessToken, {
  name: '회사',
  address: '인천 부평구',
  center: CENTER,
  radiusM: 100,
  enabled: true,
  recipientFriendIds: [강한.id],
});
console.log(`안심장소 등록: ${zone.name} 반경 ${zone.radiusM}m, 알림 대상 ${zone.recipientFriendIds.length}명`);
if (zone.recipientFriendIds.length !== 1) throw new Error('알림 대상이 저장되지 않았습니다');

console.log('\n1) 멀리서 출발 (500m 밖)');
await upload(지원.accessToken, north(500));
await wait(2000);

console.log('2) 안심장소 안으로 (50m 지점)');
await upload(지원.accessToken, north(50));
await wait(2500);

console.log('3) 경계에서 흔들림 (105m, 98m) — 알림이 울리면 안 됩니다');
await upload(지원.accessToken, north(105));
await wait(1500);
await upload(지원.accessToken, north(98));
await wait(1500);

console.log('4) 완전히 나감 (300m)');
await upload(지원.accessToken, north(300));
await wait(2500);

const events = await call('GET', '/geofences/events', 지원.accessToken);
console.log('\n기록된 진입·이탈:', events.map((e) => e.kind).join(' → ') || '(없음)');
console.log('강한이 받은 알림:', alerts.map((a) => a.kind).join(' → ') || '(없음)');

sock.close();
await db.query('UPDATE member.users SET plan = $1 WHERE id = $2', [before, 지원.id]);
await db.end();
const ok = events.length === 2 && events.map((e) => e.kind).join(',') === 'leave,enter' && alerts.length === 2;
console.log(ok ? '\n통과: 진입 1번, 이탈 1번. 경계 흔들림에는 울리지 않았습니다' : '\n실패');
process.exit(ok ? 0 : 1);
