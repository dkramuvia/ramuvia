import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import pg from 'pg';

/**
 * 비밀번호 해시 함수를 가져옵니다.
 *
 * **운영 이미지에는 `src/` 가 없습니다** — Dockerfile 이 `dist`·`migrations`·`scripts`
 * 만 복사합니다. 그래서 `../src/...ts` 를 바로 가져오면 서버에서
 * `ERR_MODULE_NOT_FOUND` 로 죽습니다. 관리자 계정은 **운영에서 만들어야 하는데**
 * 정작 거기서만 안 되는 셈이었습니다 (2026-10-01 확인).
 *
 * 빌드된 쪽을 먼저 보고, 없으면(개발 PC) 원본을 봅니다.
 */
const { hashPassword } = await import('../dist/admin/admin-password.js').catch(() =>
  import('../src/admin/admin-password.ts'),
);

/**
 * 관리자 계정 만들기 / 비밀번호 바꾸기.
 *
 *   개발 PC   npm run admin:create
 *   운영 서버  ~/create-admin.sh   (bash 가 물어보고 이 스크립트에 넘겨 줍니다)
 *
 * 비밀번호는 인자로 받지 않습니다. 명령 기록(history)과 프로세스 목록에 그대로 남기 때문입니다.
 *
 * **입력을 두 가지로 받습니다.**
 *   터미널이면  한 줄씩 물어봅니다 (개발 PC 에서 쓰는 길)
 *   아니면      stdin 을 통째로 읽어 다섯 줄로 나눕니다
 *
 * 왜 둘인가: 컨테이너 안에서 readline 으로 물어보면 **첫 줄만 받고 멈춥니다**
 * (2026-10-01 확인 — `docker exec -i` 로 파이프를 넣으면 `이름:` 에서 더 안 읽습니다).
 * 그래서 터미널이 아닐 때는 묻지 않고 통째로 읽습니다.
 */

/** stdin 을 끝까지 읽습니다 */
async function readAll() {
  const chunks = [];
  for await (const c of stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

let loginId, name, roleInput, password, again;

if (stdin.isTTY) {
  const rl = createInterface({ input: stdin, output: stdout });
  loginId = (await rl.question('아이디: ')).trim();
  name = (await rl.question('이름: ')).trim();
  roleInput = (await rl.question('권한 (viewer / editor / owner) [editor]: ')).trim() || 'editor';
  password = (await rl.question('비밀번호 (10자 이상): ')).trim();
  again = (await rl.question('비밀번호 확인: ')).trim();
  rl.close();
} else {
  const lines = (await readAll()).split('\n');
  if (lines.length < 5) {
    throw new Error(
      `입력이 ${lines.length}줄입니다. 아이디·이름·권한·비밀번호·비밀번호확인 다섯 줄이 필요합니다`,
    );
  }
  [loginId, name, roleInput, password, again] = lines.map((l) => l.replace(/\r$/, '').trim());
  roleInput = roleInput || 'editor';
}

if (!loginId || !name) throw new Error('아이디와 이름은 비울 수 없습니다');
if (!['viewer', 'editor', 'owner'].includes(roleInput)) throw new Error('권한은 viewer / editor / owner 중 하나여야 합니다');
if (password.length < 10) throw new Error('비밀번호는 10자 이상이어야 합니다');
if (password !== again) throw new Error('비밀번호가 서로 다릅니다');

const client = new pg.Client({ connectionString: process.env.MAIN_DATABASE_URL });
await client.connect();

const hash = await hashPassword(password);
const { rows } = await client.query(
  `INSERT INTO config.admin_users (login_id, password_hash, name, role)
   VALUES ($1, $2, $3, $4)
   ON CONFLICT (login_id) DO UPDATE
     SET password_hash = EXCLUDED.password_hash,
         name = EXCLUDED.name,
         role = EXCLUDED.role,
         disabled = false,
         updated_at = now()
   RETURNING login_id, name, role, (xmax = 0) AS created`,
  [loginId, hash, name, roleInput],
);
await client.end();

const row = rows[0];
console.log(`${row.created ? '만들었습니다' : '다시 설정했습니다'}: ${row.login_id} (${row.name}, ${row.role})`);
