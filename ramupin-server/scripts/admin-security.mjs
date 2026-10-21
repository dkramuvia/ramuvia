import pg from 'pg';

/**
 * 관리자 로그인 비상 처리 (OTP · 계정 잠금, migrations/main/0041).
 *
 *   잠금 풀기     node scripts/admin-security.mjs unlock <아이디>
 *   OTP 초기화    node scripts/admin-security.mjs reset-otp <아이디>
 *
 * 운영 서버에서는 api 컨테이너 안에서 실행합니다:
 *   docker compose -f docker-compose.yml -f docker-compose.prod.yml exec api node scripts/admin-security.mjs reset-otp ramuadmin
 *
 * OTP 를 초기화하면 그 관리자는 다음 로그인 때 인증 앱에 QR 을 다시 등록합니다 (폰을 바꾸거나 잃었을 때).
 * 한 일은 관리자 접근기록에 남습니다 (누가 했는지는 서버 접속기록으로 압니다).
 */
const [command, loginId] = process.argv.slice(2);
if (!['unlock', 'reset-otp'].includes(command) || !loginId) {
  console.error('사용: node scripts/admin-security.mjs <unlock|reset-otp> <아이디>');
  process.exit(1);
}

const url = process.env.MAIN_DATABASE_URL;
if (!url) {
  console.error('MAIN_DATABASE_URL 이 없습니다 (.env 또는 컨테이너 환경변수)');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const set =
    command === 'unlock'
      ? 'failed_count = 0, locked_until = NULL'
      : 'otp_secret_enc = NULL, otp_enabled = false, failed_count = 0, locked_until = NULL';
  const { rows } = await client.query(`UPDATE config.admin_users SET ${set}, updated_at = now() WHERE login_id = $1 RETURNING id, name`, [loginId]);
  if (rows.length === 0) {
    console.error(`없는 관리자 아이디입니다: ${loginId}`);
    process.exit(1);
  }
  await client.query(`INSERT INTO config.admin_access_logs (admin_id, login_id, action, ip, user_agent) VALUES ($1, $2, $3, NULL, 'server: scripts/admin-security.mjs')`, [
    rows[0].id,
    loginId,
    command === 'unlock' ? 'unlocked' : 'otp_reset',
  ]);
  console.log(command === 'unlock' ? `${rows[0].name} (${loginId}) 잠금을 풀었습니다` : `${rows[0].name} (${loginId}) OTP 를 초기화했습니다. 다음 로그인 때 다시 등록합니다`);
} finally {
  await client.end();
}
