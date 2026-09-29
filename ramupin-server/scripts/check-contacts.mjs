// 주소록으로 친구 찾기 확인 (WBS 12.9)
//   서버를 띄운 상태에서  node scripts/check-contacts.mjs
//
// 보는 것
//   1. 주소록에 있는 번호로 사용자를 찾는가
//   2. 모르는 번호는 안 나오는가
//   3. **번호가 서버에 저장되지 않는가** (이게 제일 중요합니다)
//   4. 찾기를 끄면 안 나오는가
//   5. 이미 친구는 안 나오는가
//   6. 너무 많이 보내면 거절하는가
import { createHmac } from 'node:crypto';
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

// 친구면 안 나옵니다. 잠시 끊습니다
const 원래친구 = (
  await db.query('SELECT user_id, friend_id FROM social.friendships WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)', [나.id, 남.id])
).rows;
await db.query('DELETE FROM social.friendships WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)', [나.id, 남.id]);

// 남에게 시험용 번호를 붙입니다.
// 해시는 서버와 **같은 방식**으로 만듭니다 (common/phone.ts 의 HMAC-SHA256)
const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const hashKey = Buffer.from(/^PHONE_HASH_KEY=(.+)$/m.exec(env)[1].trim(), 'base64');
const 해시하기 = (번호) => createHmac('sha256', hashKey).update(번호.replace(/\D/g, '')).digest('hex');

const 남의번호 = '01099998888';
const 원래전화 = (await db.query('SELECT phone_hash FROM member.user_phones WHERE user_id = $1', [남.id])).rows[0];
await db.query(
  `INSERT INTO member.user_phones (user_id, phone_hash, phone_encrypted, verified_at, updated_at)
   VALUES ($1, $2, $3, now(), now())
   ON CONFLICT (user_id) DO UPDATE SET phone_hash = EXCLUDED.phone_hash`,
  // 암호문은 이 시험에서 쓰지 않습니다. 빈 값을 넣습니다
  [남.id, 해시하기(남의번호), Buffer.alloc(0)],
);
await db.query('UPDATE member.users SET phone_discoverable = true WHERE id = $1', [남.id]);

console.log('1. 주소록에 있는 번호로 찾음');
const 찾음 = await call('POST', '/friends/contacts/match', 나.accessToken, { phoneNumbers: ['01000000001', 남의번호] });
확인('남이 나옴', 찾음.some((s) => s.user.id === 남.id));
확인('번호가 응답에 없음', !JSON.stringify(찾음).includes(남의번호));

console.log('\n2. 모르는 번호는 안 나옴');
const 결과 = await call('POST', '/friends/contacts/match', 나.accessToken, { phoneNumbers: ['01000000001', '01000000002'] });
확인('빈 목록', Array.isArray(결과) && 결과.length === 0);

console.log('\n3. 번호가 저장되지 않음');
const { rows: 저장된번호 } = await db.query('SELECT count(*)::int AS n FROM member.user_phones WHERE phone_hash IS NOT NULL');
const 전 = 저장된번호[0].n;
await call('POST', '/friends/contacts/match', 나.accessToken, { phoneNumbers: ['01011112222', '01033334444'] });
const { rows: 후행 } = await db.query('SELECT count(*)::int AS n FROM member.user_phones WHERE phone_hash IS NOT NULL');
확인('조회해도 번호가 늘지 않음', 후행[0].n === 전);

const { rows: 기록 } = await db.query("SELECT count(*)::int AS n FROM member.phone_access_logs WHERE user_id = $1 AND purpose = 'contact-match'", [나.id]);
확인('개인정보 조회 기록은 남음', 기록[0].n > 0);

console.log('\n4. 찾기를 끄면 안 나옴');
const 설정 = await call('GET', '/friends/contacts/discoverable', 나.accessToken);
확인('기본은 켜짐', 설정.discoverable === true);
await call('PUT', '/friends/contacts/discoverable', 나.accessToken, { discoverable: false });
확인('끌 수 있음', (await call('GET', '/friends/contacts/discoverable', 나.accessToken)).discoverable === false);
await call('PUT', '/friends/contacts/discoverable', 나.accessToken, { discoverable: true });

// 상대가 꺼 두면 내 주소록에 있어도 안 나와야 합니다
await db.query('UPDATE member.users SET phone_discoverable = false WHERE id = $1', [남.id]);
확인('끈 사람은 안 나옴', !(await call('POST', '/friends/contacts/match', 나.accessToken, { phoneNumbers: [남의번호] })).some((s) => s.user.id === 남.id));
await db.query('UPDATE member.users SET phone_discoverable = true WHERE id = $1', [남.id]);

console.log('\n5. 이미 친구면 안 나옴');
await db.query('INSERT INTO social.friendships (user_id, friend_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [나.id, 남.id]);
확인('친구는 안 나옴', !(await call('POST', '/friends/contacts/match', 나.accessToken, { phoneNumbers: [남의번호] })).some((s) => s.user.id === 남.id));
await db.query('DELETE FROM social.friendships WHERE user_id = $1 AND friend_id = $2', [나.id, 남.id]);

console.log('\n6. 너무 많이 보내면 거절');
const 너무많이 = await call('POST', '/friends/contacts/match', 나.accessToken, {
  phoneNumbers: Array.from({ length: 501 }, (_, i) => `0101111${String(i).padStart(4, '0')}`),
}).catch((e) => ({ error: String(e) }));
확인('501개는 거절', !!너무많이.error);

// 뒷정리
if (원래전화) await db.query('UPDATE member.user_phones SET phone_hash = $1 WHERE user_id = $2', [원래전화.phone_hash, 남.id]);
else await db.query('DELETE FROM member.user_phones WHERE user_id = $1', [남.id]);
for (const r of 원래친구) {
  await db.query('INSERT INTO social.friendships (user_id, friend_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [r.user_id, r.friend_id]);
}
await db.end();

console.log(실패 === 0 ? '\n모두 통과' : `\n${실패}개 실패`);
process.exit(실패 === 0 ? 0 : 1);
