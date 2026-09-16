// 개발용: 새로 가입한 계정(카카오 로그인 등)에 시드 친구들을 붙여 줍니다.
//   npm run dev:befriend -- 12345678        (내 8자리 ID)
// 공유 수준은 시드와 같게: 지원·상원 정확, 지윤002·caramel001 흐림, RamuVia001 비공개
import pg from 'pg';

const url = process.env.MIGRATOR_MAIN_URL;
if (!url) throw new Error('MIGRATOR_MAIN_URL 환경변수가 없습니다');
if (process.env.NODE_ENV === 'production') throw new Error('운영 환경에서는 실행하지 않습니다');

const publicId = process.argv[2];
if (!publicId) throw new Error('사용법: npm run dev:befriend -- 12345678');

const shareFromMe = { RamuVia001: 'hidden', 지원: 'exact', 상원: 'exact', 지윤002: 'blurred', caramel001: 'blurred' };
const shareToMe = { RamuVia001: 'exact', 지원: 'exact', 상원: 'blurred', 지윤002: 'exact', caramel001: 'hidden' };
const settingsFor = (level) => ({ show: level !== 'hidden', route: level === 'exact', battery: level !== 'hidden' });

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const me = await client.query('SELECT id, nickname FROM member.users WHERE public_id = $1', [publicId]);
  if (me.rowCount === 0) throw new Error(`${publicId} 사용자가 없습니다`);
  const myId = me.rows[0].id;

  await client.query('BEGIN');
  for (const [nickname, level] of Object.entries(shareFromMe)) {
    const friend = await client.query('SELECT id FROM member.users WHERE nickname = $1', [nickname]);
    if (friend.rowCount === 0) continue;
    const friendId = friend.rows[0].id;
    await client.query('INSERT INTO social.friendships (user_id, friend_id) VALUES ($1, $2), ($2, $1) ON CONFLICT DO NOTHING', [myId, friendId]);
    const mine = settingsFor(level);
    const theirs = settingsFor(shareToMe[nickname]);
    await client.query(
      `INSERT INTO social.friend_share_settings (owner_id, friend_id, location_level, show_status, share_route, share_battery)
       VALUES ($1, $2, $3, $4, $5, $6), ($2, $1, $7, $8, $9, $10)
       ON CONFLICT (owner_id, friend_id) DO UPDATE
         SET location_level = EXCLUDED.location_level, show_status = EXCLUDED.show_status,
             share_route = EXCLUDED.share_route, share_battery = EXCLUDED.share_battery`,
      [myId, friendId, level, mine.show, mine.route, mine.battery, shareToMe[nickname], theirs.show, theirs.route, theirs.battery],
    );
  }
  await client.query('COMMIT');
  console.log(`${me.rows[0].nickname}(${publicId}) 에게 시드 친구 ${Object.keys(shareFromMe).length}명을 연결했습니다`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
