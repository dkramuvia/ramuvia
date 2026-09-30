// 과속 경고 확인 (WBS 8.1)
//   서버를 띄운 상태에서  node scripts/check-speeding.mjs
//
// 보는 것
//   1. 잠깐 튄 속도로는 안 울리는가 (터널·고가도로에서 GPS 가 튑니다)
//   2. 이어서 넘으면 **본인에게** 경고가 오는가
//   3. 더 이어지면 **보호자에게** 알림이 가는가
//   4. 연달아 여러 번 울리지 않는가
//
// 속도는 **m/s 로 보냅니다** — 기기가 그렇게 보냅니다. 서버가 km/h 로 바꿔 판정합니다.
import { readFileSync } from 'node:fs';

import pg from 'pg';
import { io } from 'socket.io-client';

import { API, call, login, wait } from './dev-login.mjs';

const db = new pg.Client({
  connectionString: /^MIGRATOR_MAIN_URL=(.+)$/m.exec(readFileSync(new URL('../.env', import.meta.url), 'utf8'))[1].trim(),
});
await db.connect();

const 지원 = await login('26460002'); // 운전하는 사람
const 강한 = await login('26467878'); // 보호자

let 실패 = 0;
const 확인 = (라벨, 조건) => {
  console.log(`  ${조건 ? 'O' : 'X'} ${라벨}`);
  if (!조건) 실패 += 1;
};

// 과속 경고는 유료 기능입니다 (features.speedingAlert)
const 원래등급 = (await db.query('SELECT plan FROM member.users WHERE id = $1', [지원.id])).rows[0].plan;
await db.query("UPDATE member.users SET plan = 'platinum' WHERE id = $1", [지원.id]);
// 강한이 지원의 과속 알림을 받도록
await db.query(
  `INSERT INTO social.friend_alert_settings (owner_id, friend_id, speeding) VALUES ($1, $2, true)
   ON CONFLICT (owner_id, friend_id) DO UPDATE SET speeding = true`,
  [강한.id, 지원.id],
);

const 지원소켓 = io(API, { path: '/ws', transports: ['websocket'], auth: { token: 지원.accessToken } });
const 강한소켓 = io(API, { path: '/ws', transports: ['websocket'], auth: { token: 강한.accessToken } });
const 본인경고 = [];
const 보호자알림 = [];
지원소켓.on('speeding', (p) => 본인경고.push(p));
강한소켓.on('speeding', (p) => 보호자알림.push(p));
await Promise.all([new Promise((r) => 지원소켓.on('ready', r)), new Promise((r) => 강한소켓.on('ready', r))]);

/** 초 전 시각에 그 속도(km/h)로 찍힌 점을 보냅니다 */
const 보내기 = async (points) =>
  call('POST', '/locations', 지원.accessToken, {
    points: points.map(([초전, kmh]) => ({
      latitude: 37.4763,
      longitude: 126.8879,
      accuracy: 10,
      battery: 80,
      // 기기는 m/s 로 보냅니다
      speed: kmh / 3.6,
      measuredAt: new Date(Date.now() - 초전 * 1000).toISOString(),
    })),
  });

console.log('1. 잠깐 튄 값으로는 안 울림');
본인경고.length = 0;
await 보내기([[20, 60], [10, 60], [0, 220]]);
await wait(1500);
확인('경고 없음', 본인경고.length === 0);

console.log('\n2. 이어서 넘으면 본인 경고');
// 앞선 실행에서 남은 "방금 울렸으니 쉬어라" 기록을 비웁니다.
// 빠뜨리면 스크립트를 두 번째 돌릴 때만 실패합니다 (서버가 기억을 들고 있어서)
await call('POST', '/locations/reset-speeding', 지원.accessToken, {});
본인경고.length = 0;
await 보내기([[60, 160], [40, 165], [20, 160], [0, 158]]);
await wait(1500);
확인('본인에게 경고 옴', 본인경고.length > 0);
확인('속도가 실려 옴', (본인경고[0]?.speedKmh ?? 0) >= 160);

console.log('\n3. 더 이어지면 보호자에게');
보호자알림.length = 0;
// 마지막 알림 뒤 쿨다운(10분)이 있으므로 기록을 비웁니다
await call('POST', '/locations/reset-speeding', 지원.accessToken, {});
await 보내기([[180, 160], [120, 165], [60, 160], [0, 162]]);
await wait(1500);
확인('보호자에게 알림 옴', 보호자알림.some((p) => p.kind === 'speedingFriend'));

console.log('\n4. 연달아 울리지 않음');
본인경고.length = 0;
await 보내기([[60, 160], [40, 165], [20, 160], [0, 158]]);
await wait(1500);
확인('다시 안 울림', 본인경고.length === 0);

// 뒷정리
await db.query('UPDATE member.users SET plan = $1 WHERE id = $2', [원래등급, 지원.id]);
지원소켓.close();
강한소켓.close();
await db.end();

console.log(실패 === 0 ? '\n모두 통과' : `\n${실패}개 실패`);
process.exit(실패 === 0 ? 0 : 1);
