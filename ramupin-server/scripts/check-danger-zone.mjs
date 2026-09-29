// 위험지역 알림 확인 (WBS 9.6)
//   서버를 띄운 상태에서  node scripts/check-danger-zone.mjs
//
// 공공데이터가 아직 없어 시험용 위험지역을 직접 넣고 봅니다.
//   1. 들어가면 본인에게 알림이 오는가
//   2. 같은 곳에 계속 있어도 반복해서 울리지 않는가
//   3. 나갈 때는 안 울리는가
//   4. 꺼 둔 위험지역은 안 울리는가
import { readFileSync } from 'node:fs';

import pg from 'pg';
import { io } from 'socket.io-client';

import { API, call, login, wait } from './dev-login.mjs';

const db = new pg.Client({
  connectionString: /^MIGRATOR_MAIN_URL=(.+)$/m.exec(readFileSync(new URL('../.env', import.meta.url), 'utf8'))[1].trim(),
});
await db.connect();

const 나 = await login('26467878');

let 실패 = 0;
const 확인 = (라벨, 조건) => {
  console.log(`  ${조건 ? 'O' : 'X'} ${라벨}`);
  if (!조건) 실패 += 1;
};

const 중심 = { latitude: 37.4763, longitude: 126.8879 };
const 북쪽 = (m) => ({ latitude: 중심.latitude + m / 111_320, longitude: 중심.longitude });

const 보내기 = (coords) =>
  call('POST', '/locations', 나.accessToken, {
    points: [{ ...coords, accuracy: 10, battery: 80, measuredAt: new Date().toISOString() }],
  });

await db.query("DELETE FROM config.danger_zones WHERE name = '시험 낙석 구간'");
const { rows: z } = await db.query(
  `INSERT INTO config.danger_zones (name, kind, latitude, longitude, radius_m) VALUES ('시험 낙석 구간', 'rockfall', $1, $2, 200) RETURNING id`,
  [중심.latitude, 중심.longitude],
);
const zoneId = z[0].id;
await db.query('DELETE FROM member.danger_zone_visits WHERE user_id = $1', [나.id]);

const sock = io(API, { path: '/ws', transports: ['websocket'], auth: { token: 나.accessToken } });
const 알림 = [];
sock.on('danger-zone', (p) => 알림.push(p));
await new Promise((r) => sock.on('ready', r));

try {
  console.log('1. 들어가면 알림');
  await 보내기(북쪽(1000)); // 먼저 밖에서 시작
  await wait(1200);
  알림.length = 0;
  await 보내기(중심);
  await wait(1500);
  확인('알림 옴', 알림.some((a) => a.zoneName === '시험 낙석 구간'));

  console.log('\n2. 계속 있어도 반복 안 함');
  알림.length = 0;
  await 보내기(중심);
  await wait(1200);
  확인('다시 안 울림', 알림.length === 0);

  console.log('\n3. 나갈 때는 안 울림');
  알림.length = 0;
  await 보내기(북쪽(1000));
  await wait(1200);
  확인('나갈 때 조용', 알림.length === 0);

  console.log('\n4. 꺼 두면 안 울림');
  await db.query('UPDATE config.danger_zones SET enabled = false WHERE id = $1', [zoneId]);
  await db.query('DELETE FROM member.danger_zone_visits WHERE user_id = $1', [나.id]);
  알림.length = 0;
  await 보내기(중심);
  await wait(1200);
  확인('꺼진 곳은 조용', 알림.length === 0);
} finally {
  await db.query('DELETE FROM config.danger_zones WHERE id = $1', [zoneId]);
  await db.query('DELETE FROM member.danger_zone_visits WHERE user_id = $1', [나.id]);
  sock.close();
  await db.end();
}

console.log(실패 === 0 ? '\n모두 통과' : `\n${실패}개 실패`);
process.exit(실패 === 0 ? 0 : 1);
