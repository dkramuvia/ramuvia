// 사진 공유 링크 확인 (WBS 6)
//   서버를 띄운 상태에서  node scripts/check-post-share.mjs
//
// 보는 것
//   1. 링크가 만들어지는가 / 두 번 눌러도 같은 링크인가
//   2. **로그인 없이** 열리는가
//   3. **좌표가 새지 않는가**
//   4. 끄면 막히는가
//   5. **그룹에서 나가면 저절로 막히는가** (이게 핵심입니다)
//   6. 게시물을 지우면 막히는가
//   7. 없는 주소는 404
import { readFileSync } from 'node:fs';

import pg from 'pg';

import { API, call, login } from './dev-login.mjs';

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

/** 로그인 없이 여는 조회 */
const 공개조회 = async (token) => {
  const res = await fetch(`${API}/shared/${token}`);
  return { status: res.status, body: res.status === 200 ? await res.json() : null };
};

// 시험용 그룹·게시물을 직접 만듭니다 (업로드는 저장소가 필요해 여기서는 건너뜁니다)
const { rows: g } = await db.query(`INSERT INTO social.groups (name, owner_id) VALUES ('공유시험그룹', $1) RETURNING id`, [나.id]);
const groupId = g[0].id;
await db.query('INSERT INTO social.group_members (group_id, user_id) VALUES ($1, $2)', [groupId, 나.id]);
const { rows: p } = await db.query(
  `INSERT INTO media.posts (group_id, author_id, place_name, latitude, longitude) VALUES ($1, $2, '시험장소', 37.4763, 126.8879) RETURNING id`,
  [groupId, 나.id],
);
const postId = p[0].id;

console.log('1. 링크 만들기');
const 링크 = await call('POST', `/gallery/posts/${postId}/share`, 나.accessToken, {});
확인('주소가 옴', typeof 링크.url === 'string' && 링크.url.includes('/p/'));
const 다시 = await call('POST', `/gallery/posts/${postId}/share`, 나.accessToken, {});
확인('두 번 눌러도 같은 주소', 다시.url === 링크.url);

const token = 링크.url.split('/p/')[1];

console.log('\n2~3. 로그인 없이 열림 / 좌표 없음');
const 열기 = await 공개조회(token);
확인('200 으로 열림', 열기.status === 200);
확인('장소 이름은 옴', 열기.body?.placeName === '시험장소');
확인('좌표 없음', !JSON.stringify(열기.body ?? {}).includes('latitude'));

console.log('\n5. 그룹에서 나가면 막힘');
await db.query('DELETE FROM social.group_members WHERE group_id = $1 AND user_id = $2', [groupId, 나.id]);
확인('404', (await 공개조회(token)).status === 404);
await db.query('INSERT INTO social.group_members (group_id, user_id) VALUES ($1, $2)', [groupId, 나.id]);
확인('다시 들어가면 열림', (await 공개조회(token)).status === 200);

console.log('\n6. 게시물을 지우면 막힘');
await db.query('UPDATE media.posts SET deleted_at = now() WHERE id = $1', [postId]);
확인('404', (await 공개조회(token)).status === 404);
await db.query('UPDATE media.posts SET deleted_at = NULL WHERE id = $1', [postId]);

console.log('\n4. 끄면 막힘');
await call('DELETE', `/gallery/posts/${postId}/share`, 나.accessToken);
확인('404', (await 공개조회(token)).status === 404);

console.log('\n7. 없는 주소');
확인('404', (await 공개조회('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).status === 404);

// 뒷정리
await db.query('DELETE FROM media.posts WHERE id = $1', [postId]);
await db.query('DELETE FROM social.groups WHERE id = $1', [groupId]);
await db.end();

console.log(실패 === 0 ? '\n모두 통과' : `\n${실패}개 실패`);
process.exit(실패 === 0 ? 0 : 1);
