// 친구 QR 일회용 토큰 확인 (WBS 3.6)
//   서버를 띄운 상태에서  node scripts/check-qr.mjs
// 토큰으로 상대를 찾을 수 있고, 친구 요청이 만들어지면 그 토큰이 더는 안 통하는지 봅니다
import { readFileSync } from 'node:fs';

import pg from 'pg';

import { call, login } from './dev-login.mjs';

const url = /^MIGRATOR_MAIN_URL=(.+)$/m.exec(readFileSync(new URL('../.env', import.meta.url), 'utf8'))[1].trim();
const db = new pg.Client({ connectionString: url });
await db.connect();

// 아직 친구가 아닌 사이여야 합니다 (seed: 김민수 → 강한 은 대기 중 요청)
const 강한 = await login('26467878');
const 이서연 = await login('26460008');
await db.query(`DELETE FROM social.friend_requests WHERE (from_user_id=$1 AND to_user_id=$2) OR (from_user_id=$2 AND to_user_id=$1)`, [강한.id, 이서연.id]);
await db.query(`DELETE FROM social.friendships WHERE (user_id=$1 AND friend_id=$2) OR (user_id=$2 AND friend_id=$1)`, [강한.id, 이서연.id]);

// 1) 이서연이 자기 QR 토큰을 받습니다
const qr = await call('POST', '/friends/qr-token', 이서연.accessToken);
console.log(`QR 토큰 발급: ${qr.token.slice(0, 8)}... (${qr.expiresInSec}초 뒤 만료)`);
if (qr.token.includes(이서연.id) || /^\d{8}$/.test(qr.token)) throw new Error('토큰에 사용자 정보가 들어 있습니다');

// 2) 강한이 찍습니다 — 읽는 것만으로는 토큰이 사라지지 않아야 합니다
const found = await call('GET', `/friends/by-qr?token=${encodeURIComponent(qr.token)}`, 강한.accessToken);
console.log(`찍어서 찾은 사람: ${found.nickname} (관계: ${found.relation})`);
const again = await call('GET', `/friends/by-qr?token=${encodeURIComponent(qr.token)}`, 강한.accessToken);
console.log(`같은 토큰으로 다시 찾기: ${again ? '됨 (맞음 — 닫았다 다시 찍을 수 있어야 합니다)' : '안 됨'}`);

// 3) 친구 요청을 보내면 그때 토큰이 버려집니다
const sent = await call('POST', '/friends/requests', 강한.accessToken, { qrToken: qr.token });
console.log(`\n친구 요청: ${sent.status}`);

let reused = true;
await call('GET', `/friends/by-qr?token=${encodeURIComponent(qr.token)}`, 강한.accessToken).catch(() => (reused = false));
console.log(`요청 뒤 같은 토큰 재사용: ${reused ? '됨 (틀림)' : '막힘 (맞음 — 일회용)'}`);

// 4) 아무 토큰이나 넣으면 거절
let bogus = true;
await call('GET', '/friends/by-qr?token=aaaaaaaaaaaaaaaa', 강한.accessToken).catch(() => (bogus = false));
console.log(`없는 토큰: ${bogus ? '통과됨 (틀림)' : '막힘 (맞음)'}`);

// 정리
await db.query(`DELETE FROM social.friend_requests WHERE (from_user_id=$1 AND to_user_id=$2)`, [강한.id, 이서연.id]);
await db.end();

const ok = !!found && found.relation === 'none' && !!again && sent.status === 'pending' && !reused && !bogus;
console.log(ok ? '\n통과: 토큰으로 찾을 수 있고, 요청이 만들어지면 그 토큰은 버려집니다' : '\n실패');
process.exit(ok ? 0 : 1);
