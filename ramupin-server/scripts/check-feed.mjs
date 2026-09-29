// 지도 메인 활동 기록(피드) 확인 (WBS 9.7)
//   서버를 띄운 상태에서  node scripts/check-feed.mjs
//
// 보는 것
//   1. 친구가 안심장소를 드나들면 피드에 뜨는가
//   2. 누가 내 위치를 보면 뜨는가
//   3. 숨김 모드인 친구의 "머무는 중" 은 안 뜨는가
//   4. 오래된 일은 안 뜨는가
import { readFileSync } from 'node:fs';

import pg from 'pg';

import { call, login } from './dev-login.mjs';

const db = new pg.Client({
  connectionString: /^MIGRATOR_MAIN_URL=(.+)$/m.exec(readFileSync(new URL('../.env', import.meta.url), 'utf8'))[1].trim(),
});
const locDb = new pg.Client({
  connectionString: /^MIGRATOR_LOCATION_URL=(.+)$/m.exec(readFileSync(new URL('../.env', import.meta.url), 'utf8'))[1].trim(),
});
await db.connect();
await locDb.connect();

const 나 = await login('26467878');
const 남 = await login('26460002');

let 실패 = 0;
const 확인 = (라벨, 조건) => {
  console.log(`  ${조건 ? 'O' : 'X'} ${라벨}`);
  if (!조건) 실패 += 1;
};

// 이전 실행 흔적 정리
await db.query('DELETE FROM member.safe_zones WHERE user_id = $1 AND name = $2', [남.id, '피드시험장소']);
await locDb.query("DELETE FROM location.location_access_logs WHERE subject_user_id = $1 AND purpose = 'feed-test'", [나.id]);

console.log('1. 친구의 안심장소 출입');
const { rows: zone } = await db.query(
  `INSERT INTO member.safe_zones (user_id, name, latitude, longitude, radius_m) VALUES ($1, '피드시험장소', 37.4763, 126.8879, 100) RETURNING id`,
  [남.id],
);
await db.query('INSERT INTO member.safe_zone_recipients (zone_id, friend_id) VALUES ($1, $2)', [zone[0].id, 나.id]);
await db.query(
  `INSERT INTO member.safe_zone_events (zone_id, user_id, kind, occurred_at, latitude, longitude)
   VALUES ($1, $2, 'enter', now() - interval '10 minutes', 37.4763, 126.8879)`,
  [zone[0].id, 남.id],
);
const 피드 = await call('GET', '/feed', 나.accessToken);
확인('도착 기록이 뜸', 피드.some((f) => f.type === 'arrived' && f.message.includes('피드시험장소')));

console.log('\n2. 누가 내 위치를 봤는지');
await locDb.query(
  "INSERT INTO location.location_access_logs (subject_user_id, viewer_user_id, purpose, accessed_at) VALUES ($1, $2, 'feed-test', now() - interval '5 minutes')",
  [나.id, 남.id],
);
const 피드2 = await call('GET', '/feed', 나.accessToken);
확인('확인 기록이 뜸', 피드2.some((f) => f.type === 'checkedLocation'));

console.log('\n4. 오래된 일은 안 뜸');
await db.query("UPDATE member.safe_zone_events SET occurred_at = now() - interval '3 days' WHERE zone_id = $1", [zone[0].id]);
const 피드3 = await call('GET', '/feed', 나.accessToken);
확인('3일 전 기록은 안 뜸', !피드3.some((f) => f.type === 'arrived' && f.message.includes('피드시험장소')));

console.log('\n3. 숨김 모드 친구는 "머무는 중" 이 안 뜸');
await db.query('UPDATE member.users SET hide_all = true WHERE id = $1', [남.id]);
const 피드4 = await call('GET', '/feed', 나.accessToken);
확인('숨김 중인 친구의 머무름 없음', !피드4.some((f) => f.type === 'stay' && f.message.includes('님')  && f.id.includes(남.id)));
await db.query('UPDATE member.users SET hide_all = false WHERE id = $1', [남.id]);

console.log('\n5. 시각 순으로 옴');
const 정렬 = 피드2.map((f) => f.createdAt);
확인('최신이 먼저', 정렬.every((v, i) => i === 0 || 정렬[i - 1] >= v));

// 뒷정리
await db.query('DELETE FROM member.safe_zones WHERE id = $1', [zone[0].id]);
await locDb.query("DELETE FROM location.location_access_logs WHERE purpose = 'feed-test'");
await db.end();
await locDb.end();

console.log(실패 === 0 ? '\n모두 통과' : `\n${실패}개 실패`);
process.exit(실패 === 0 ? 0 : 1);
