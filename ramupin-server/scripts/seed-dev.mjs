// 개발용 테스트 데이터: 앱 목업과 같은 사용자·친구 (강한, RamuVia001, 지원, 상원, 지윤002, caramel001)
//   npm run db:seed     (여러 번 실행해도 중복되지 않음)
import pg from 'pg';

const url = process.env.MIGRATOR_MAIN_URL;
if (!url) throw new Error('MIGRATOR_MAIN_URL 환경변수가 없습니다');
if (process.env.NODE_ENV === 'production') throw new Error('운영 환경에서는 실행하지 않습니다');

const users = [
  { publicId: '26467878', nickname: '강한', gender: 'male' },
  { publicId: '26460001', nickname: 'RamuVia001', gender: 'female' },
  { publicId: '26460002', nickname: '지원', gender: 'female' },
  { publicId: '26460003', nickname: '상원', gender: 'male' },
  { publicId: '26460004', nickname: '지윤002', gender: 'female' },
  { publicId: '26460005', nickname: 'caramel001', gender: 'male' },
];

// 강한이 친구들에게 공유하는 수준 (앱 목업과 동일)
const shareFromMe = { RamuVia001: 'hidden', 지원: 'exact', 상원: 'exact', 지윤002: 'blurred', caramel001: 'blurred' };

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query('BEGIN');
  const ids = {};
  for (const u of users) {
    const { rows } = await client.query(
      `INSERT INTO member.users (public_id, nickname, gender, last_active_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (public_id) DO UPDATE SET nickname = EXCLUDED.nickname
       RETURNING id`,
      [u.publicId, u.nickname, u.gender],
    );
    ids[u.nickname] = rows[0].id;
  }

  const me = ids['강한'];
  for (const [nickname, level] of Object.entries(shareFromMe)) {
    const friend = ids[nickname];
    await client.query(
      `INSERT INTO social.friendships (user_id, friend_id) VALUES ($1, $2), ($2, $1) ON CONFLICT DO NOTHING`,
      [me, friend],
    );
    const on = level !== 'hidden';
    await client.query(
      `INSERT INTO social.friend_share_settings (owner_id, friend_id, location_level, show_status, share_route, share_battery)
       VALUES ($1, $2, $3, $4, $5, $6), ($2, $1, 'exact', true, true, true)
       ON CONFLICT (owner_id, friend_id) DO UPDATE
         SET location_level = EXCLUDED.location_level, show_status = EXCLUDED.show_status,
             share_route = EXCLUDED.share_route, share_battery = EXCLUDED.share_battery`,
      [me, friend, level, on, level === 'exact', on],
    );
  }
  await client.query('COMMIT');
  console.log(`seeded ${users.length} users, ${Object.keys(shareFromMe).length} friendships (login as public_id 26467878)`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
