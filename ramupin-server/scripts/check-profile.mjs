// 프로필 수정 · 닉네임 중복 · 숨김 모드 · 회원 탈퇴 확인 (WBS 3.9, 9.5, 11.2)
//   서버를 띄운 상태에서  node scripts/check-profile.mjs
// 탈퇴는 되돌릴 수 없으므로, 이 확인만을 위한 임시 사용자를 만들어 쓰고 지웁니다
import { readFileSync } from 'node:fs';

import pg from 'pg';

import { call, login, wait } from './dev-login.mjs';

const url = /^MIGRATOR_MAIN_URL=(.+)$/m.exec(readFileSync(new URL('../.env', import.meta.url), 'utf8'))[1].trim();
const db = new pg.Client({ connectionString: url });
await db.connect();

// 임시 사용자 (8자리 ID 는 시험용 대역 999xxxxx)
const PUBLIC_ID = '99900001';
await db.query(`DELETE FROM member.users WHERE public_id = $1`, [PUBLIC_ID]);
const { rows } = await db.query(
  `INSERT INTO member.users (public_id, nickname, gender) VALUES ($1, $2, 'male') RETURNING id`,
  [PUBLIC_ID, '임시확인용'],
);
const tempId = rows[0].id;
console.log(`임시 사용자 만듦: ${PUBLIC_ID} (${tempId})`);

const me = await login(PUBLIC_ID);
const 강한 = await login('26467878');

// 1) 닉네임 중복 확인
const taken = await call('GET', `/users/nickname-availability?nickname=${encodeURIComponent('강한')}`, me.accessToken);
const free = await call('GET', `/users/nickname-availability?nickname=${encodeURIComponent('임시확인용')}`, me.accessToken);
console.log(`\n닉네임 '강한' 쓸 수 있나: ${taken.available} (false 여야 함)`);
console.log(`내가 지금 쓰는 닉네임: ${free.available} (true 여야 함 — 안 바꾸고 저장할 때 막히면 안 됩니다)`);

// 2) 프로필 수정
const updated = await call('PATCH', '/me', me.accessToken, { nickname: '바꾼이름', statusMessage: '오늘도 안전하게' });
console.log(`\n프로필 수정: ${updated.nickname} / ${updated.statusMessage}`);

// 3) 남의 닉네임으로는 못 바꿉니다
let rejected = false;
await call('PATCH', '/me', me.accessToken, { nickname: '강한' }).catch(() => (rejected = true));
console.log(`남이 쓰는 닉네임으로 변경: ${rejected ? '막힘 (맞음)' : '통과됨 (틀림)'}`);

// 4) 숨김 모드
await call('POST', '/locations', me.accessToken, {
  points: [{ latitude: 37.4763, longitude: 126.8879, accuracy: 10, battery: 70, measuredAt: new Date().toISOString() }],
});
await wait(2000);
await db.query(`INSERT INTO social.friendships (user_id, friend_id) VALUES ($1,$2), ($2,$1) ON CONFLICT DO NOTHING`, [강한.id, tempId]);
await db.query(
  `INSERT INTO social.friend_share_settings (owner_id, friend_id, location_level, show_status, share_route, share_battery)
   VALUES ($1,$2,'exact',true,true,true) ON CONFLICT (owner_id, friend_id) DO UPDATE SET location_level='exact', share_route=true`,
  [tempId, 강한.id],
);

const seenBefore = (await call('GET', '/friends', 강한.accessToken)).find((f) => f.id === tempId);
await call('PUT', '/me/hide-mode', me.accessToken, { hideAll: true, until: null });
const seenAfter = (await call('GET', '/friends', 강한.accessToken)).find((f) => f.id === tempId);
console.log(`\n숨김 전 위치 보임: ${!!seenBefore?.location}`);
console.log(`숨김 후 위치 보임: ${!!seenAfter?.location} (false 여야 함)`);

const journeyHidden = await call('GET', `/users/${tempId}/journey/today`, 강한.accessToken);
console.log(`숨김 중 이동 기록: ${journeyHidden === null ? '안 보임 (맞음)' : '보임 (틀림)'}`);

await call('PUT', '/me/hide-mode', me.accessToken, { hideAll: false, until: null });
const seenBack = (await call('GET', '/friends', 강한.accessToken)).find((f) => f.id === tempId);
console.log(`숨김 끈 뒤 다시 보임: ${!!seenBack?.location}`);

// 5) 탈퇴 — 본 DB 와 위치 DB 양쪽에서 사라져야 합니다
const locUrl = /^MIGRATOR_LOCATION_URL=(.+)$/m.exec(readFileSync(new URL('../.env', import.meta.url), 'utf8'))[1].trim();
const locDb = new pg.Client({ connectionString: locUrl });
await locDb.connect();
const before = Number((await locDb.query(`SELECT count(*) FROM location.location_points WHERE user_id = $1`, [tempId])).rows[0].count);

await call('DELETE', '/me', me.accessToken, { reason: '확인용' });
await wait(500);

const userLeft = Number((await db.query(`SELECT count(*) FROM member.users WHERE id = $1`, [tempId])).rows[0].count);
const pointsLeft = Number((await locDb.query(`SELECT count(*) FROM location.location_points WHERE user_id = $1`, [tempId])).rows[0].count);
const logsLeft = Number((await locDb.query(`SELECT count(*) FROM location.location_access_logs WHERE subject_user_id = $1`, [tempId])).rows[0].count);
const reasons = Number((await db.query(`SELECT count(*) FROM member.withdrawal_reasons`)).rows[0].count);

console.log(`\n탈퇴 후`);
console.log(`  사용자 행: ${userLeft}개 (0 이어야 함)`);
console.log(`  위치 이력: ${before}건 → ${pointsLeft}건 (0 이어야 함)`);
console.log(`  위치 이용·제공 확인자료: ${logsLeft}건 (법정 보관 의무라 남아야 함)`);
console.log(`  탈퇴 사유 기록: ${reasons}건`);

await db.end();
await locDb.end();

const ok =
  taken.available === false &&
  free.available === true &&
  updated.nickname === '바꾼이름' &&
  rejected &&
  !!seenBefore?.location &&
  !seenAfter?.location &&
  journeyHidden === null &&
  !!seenBack?.location &&
  userLeft === 0 &&
  pointsLeft === 0;
console.log(ok ? '\n통과: 프로필·닉네임·숨김·탈퇴가 모두 맞게 동작합니다' : '\n실패');
process.exit(ok ? 0 : 1);
