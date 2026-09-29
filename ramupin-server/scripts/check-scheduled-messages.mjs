// 예약 메시지 확인 (WBS 8.2)
//   서버를 띄운 상태에서  node scripts/check-scheduled-messages.mjs
//
// 보는 것
//   1. 만들기·고치기·지우기가 되는가
//   2. 친구가 아닌 사람에게는 못 거는가
//   3. **때가 되면 발송기가 집어 가는가** (지난 시각으로 걸어 두고 한 바퀴 돌립니다)
//   4. **두 번 가지 않는가** (한 바퀴 더 돌려도 다시 안 보내야 합니다)
//   5. 너무 늦은 것은 건너뛰는가 (어젯밤 "약 드세요" 가 아침에 오면 안 됩니다)
import { readFileSync } from 'node:fs';

import pg from 'pg';

import { call, login } from './dev-login.mjs';

const db = new pg.Client({
  connectionString: /^MIGRATOR_MAIN_URL=(.+)$/m.exec(readFileSync(new URL('../.env', import.meta.url), 'utf8'))[1].trim(),
});
await db.connect();

const 지원 = await login('26460002'); // 예약을 거는 사람
const 강한 = await login('26467878'); // 받는 사람

let 실패 = 0;
const 확인 = (라벨, 조건) => {
  console.log(`  ${조건 ? 'O' : 'X'} ${라벨}`);
  if (!조건) 실패 += 1;
};

// 이전 실행에서 남은 것 정리
await db.query('DELETE FROM member.scheduled_messages WHERE user_id = $1', [지원.id]);

console.log('1. 만들기·고치기·지우기');
const 내일 = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
const 만든것 = await call('POST', '/scheduled-messages', 지원.accessToken, {
  targetUserId: 강한.id,
  title: '약 드세요',
  body: '저녁 약 드실 시간이에요',
  scheduledAt: 내일,
  tts: true,
});
확인('만들어짐', !!만든것.id && 만든것.targetUserId === 강한.id);

const 고친것 = await call('PUT', `/scheduled-messages/${만든것.id}`, 지원.accessToken, {
  targetUserId: 강한.id,
  title: '약 드세요 (수정)',
  body: '저녁 약 드실 시간이에요',
  scheduledAt: 내일,
  tts: false,
});
확인('고쳐짐', 고친것.title === '약 드세요 (수정)' && 고친것.tts === false);

const 목록 = await call('GET', '/scheduled-messages', 지원.accessToken);
확인('목록에 보임', 목록.some((m) => m.id === 만든것.id));

console.log('\n2. 친구가 아니면 못 검');
const 남 = await db.query("SELECT id FROM member.users WHERE id <> $1 AND id <> $2 AND id NOT IN (SELECT friend_id FROM social.friendships WHERE user_id = $1) LIMIT 1", [지원.id, 강한.id]);
if (남.rows.length === 0) {
  console.log('  - 건너뜀 (친구가 아닌 사용자가 없습니다)');
} else {
  const 결과 = await call('POST', '/scheduled-messages', 지원.accessToken, {
    targetUserId: 남.rows[0].id,
    title: 'x',
    body: 'x',
    scheduledAt: 내일,
    tts: false,
  }).catch((e) => ({ error: String(e) }));
  확인('친구가 아니면 거절', !!결과.error);
}

console.log('\n3. 때가 되면 보냄');
// 1분 전으로 걸어 둡니다 (너무 늦지는 않은 시각)
await db.query('UPDATE member.scheduled_messages SET scheduled_at = now() - interval \'1 minute\' WHERE id = $1', [만든것.id]);
const 한바퀴 = await call('POST', '/scheduled-messages/run-sender', 지원.accessToken, {});
확인('한 건 보냄', 한바퀴.sent === 1);

const 보낸뒤 = await db.query('SELECT sent_at, failed_reason FROM member.scheduled_messages WHERE id = $1', [만든것.id]);
확인('보냄 표시됨', 보낸뒤.rows[0].sent_at !== null && 보낸뒤.rows[0].failed_reason === null);

console.log('\n4. 두 번 가지 않음');
const 두번째 = await call('POST', '/scheduled-messages/run-sender', 지원.accessToken, {});
확인('다시 안 보냄', 두번째.sent === 0);

console.log('\n5. 너무 늦은 것은 건너뜀');
const 늦은것 = await call('POST', '/scheduled-messages', 지원.accessToken, {
  targetUserId: 강한.id,
  title: '어젯밤 약',
  body: '지난 예약',
  scheduledAt: 내일,
  tts: false,
});
await db.query('UPDATE member.scheduled_messages SET scheduled_at = now() - interval \'3 hours\' WHERE id = $1', [늦은것.id]);
const 세번째 = await call('POST', '/scheduled-messages/run-sender', 지원.accessToken, {});
확인('건너뜀', 세번째.skipped === 1 && 세번째.sent === 0);
const 늦은뒤 = await db.query('SELECT failed_reason FROM member.scheduled_messages WHERE id = $1', [늦은것.id]);
확인('이유가 남음', (늦은뒤.rows[0].failed_reason ?? '').includes('시간'));

console.log('\n6. 지우기');
await call('DELETE', `/scheduled-messages/${만든것.id}`, 지원.accessToken);
const 지운뒤 = await call('GET', '/scheduled-messages', 지원.accessToken);
확인('지워짐', !지운뒤.some((m) => m.id === 만든것.id));

// 뒷정리
await db.query('DELETE FROM member.scheduled_messages WHERE user_id = $1', [지원.id]);
await db.end();

console.log(실패 === 0 ? '\n모두 통과' : `\n${실패}개 실패`);
process.exit(실패 === 0 ? 0 : 1);
