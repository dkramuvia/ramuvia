// 근처 친구 찾기 확인 (WBS 12.9)
//   서버를 띄운 상태에서  node scripts/check-nearby.mjs
//
// 이 기능은 **아직 친구가 아닌 사람**에게 위치를 알려 주므로 특히 조심해서 봅니다.
//   1. 기본은 꺼짐인가 (동의하지 않은 사람이 남에게 보이면 안 됩니다)
//   2. 내가 꺼 두면 남도 못 보는가 (내 위치는 숨기고 남만 보는 것은 안 됩니다)
//   3. 둘 다 켜야 보이는가
//   4. 멀리 있으면 안 나오는가
//   5. 오래된 위치는 안 나오는가
//   6. 숨김 모드면 안 나오는가
//   7. **좌표가 새지 않는가**
import { readFileSync } from 'node:fs';

import pg from 'pg';

import { call, login } from './dev-login.mjs';

const db = new pg.Client({
  connectionString: /^MIGRATOR_MAIN_URL=(.+)$/m.exec(readFileSync(new URL('../.env', import.meta.url), 'utf8'))[1].trim(),
});
await db.connect();

const 나 = await login('26467878');
const 남 = await login('26460002');

let 실패 = 0;

const 확인 = (라벨, 조건) => {
  console.log(`  ${조건 ? 'O' : 'X'} ${라벨}`);
  if (!조건) 실패 += 1;
};

// 둘이 친구면 근처 찾기에 안 나옵니다 (이미 친구니까). 친구 관계를 잠시 끊습니다
const 원래친구 = (
  await db.query('SELECT user_id, friend_id FROM social.friendships WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)', [나.id, 남.id])
).rows;
await db.query('DELETE FROM social.friendships WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)', [나.id, 남.id]);

const 위치보내기 = (token, lat, lng, 초전 = 0) =>
  call('POST', '/locations', token, {
    points: [
      {
        latitude: lat,
        longitude: lng,
        accuracy: 10,
        battery: 80,
        measuredAt: new Date(Date.now() - 초전 * 1000).toISOString(),
      },
    ],
  });

const 기준 = { lat: 37.4763, lng: 126.8879 };
const 동쪽으로 = (m) => ({ lat: 기준.lat, lng: 기준.lng + m / (111_320 * Math.cos((기준.lat * Math.PI) / 180)) });

/**
 * 시험 도중에 죽어도 **시드 데이터를 반드시 되돌립니다.**
 *
 * 앞서 이 스크립트가 중간에 죽으면서 친구 관계를 지운 채로 남겨,
 * 다른 확인 스크립트가 줄줄이 실패했습니다 (2026-09-29).
 */
try {
  console.log('1. 기본은 꺼짐');
  await db.query('UPDATE member.users SET nearby_discoverable = false WHERE id IN ($1, $2)', [나.id, 남.id]);
  const 처음 = await call('GET', '/friends/nearby/discoverable', 나.accessToken);
  확인('내 설정이 꺼져 있음', 처음.discoverable === false);

  console.log('\n2. 내가 꺼 두면 남도 못 봄');
  // 남만 켜고 가까이 둡니다
  await db.query('UPDATE member.users SET nearby_discoverable = true WHERE id = $1', [남.id]);
  await 위치보내기(나.accessToken, 기준.lat, 기준.lng);
  await 위치보내기(남.accessToken, 기준.lat, 기준.lng);
  확인('빈 목록', (await call('GET', '/friends/nearby', 나.accessToken)).length === 0);

  console.log('\n3. 둘 다 켜야 보임');
  await call('PUT', '/friends/nearby/discoverable', 나.accessToken, { discoverable: true });
  const 목록 = await call('GET', '/friends/nearby', 나.accessToken);
  확인('남이 보임', 목록.some((s) => s.user.id === 남.id));

  console.log('\n7. 좌표가 새지 않음');
  const 항목 = 목록.find((s) => s.user.id === 남.id);
  const 글자 = JSON.stringify(항목 ?? {});
  확인('위도·경도 없음', !글자.includes('latitude') && !글자.includes('longitude'));
  확인('필요한 것만 옴', !!항목?.user.nickname && typeof 항목?.requested === 'boolean' && !!항목?.foundAt);

  console.log('\n4. 멀면 안 나옴');
  const 먼곳 = 동쪽으로(3000);
  await 위치보내기(남.accessToken, 먼곳.lat, 먼곳.lng);
  확인('3km 밖은 안 보임', !(await call('GET', '/friends/nearby', 나.accessToken)).some((s) => s.user.id === 남.id));

  console.log('\n5. 오래된 위치는 안 나옴');
  await 위치보내기(남.accessToken, 기준.lat, 기준.lng, 60 * 60); // 한 시간 전
  확인('한 시간 전 위치는 안 보임', !(await call('GET', '/friends/nearby', 나.accessToken)).some((s) => s.user.id === 남.id));

  console.log('\n6. 숨김 모드면 안 나옴');
  await 위치보내기(남.accessToken, 기준.lat, 기준.lng);
  await db.query('UPDATE member.users SET hide_all = true WHERE id = $1', [남.id]);
  확인('숨김 중인 사람은 안 보임', !(await call('GET', '/friends/nearby', 나.accessToken)).some((s) => s.user.id === 남.id));
} finally {
  // 뒷정리
  await db.query('UPDATE member.users SET hide_all = false, nearby_discoverable = false WHERE id IN ($1, $2)', [나.id, 남.id]);
  for (const r of 원래친구) {
    await db.query('INSERT INTO social.friendships (user_id, friend_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [r.user_id, r.friend_id]);
  }
  await db.end();
}

console.log(실패 === 0 ? '\n모두 통과' : `\n${실패}개 실패`);
process.exit(실패 === 0 ? 0 : 1);
