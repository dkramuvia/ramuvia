import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import pg from 'pg';

import { hashPassword } from '../src/admin/admin-password.ts';

/**
 * 관리자 계정 만들기 / 비밀번호 바꾸기.
 *
 *   npm run admin:create
 *
 * 비밀번호는 인자로 받지 않습니다. 명령 기록(history)과 프로세스 목록에 그대로 남기 때문입니다.
 */

const rl = createInterface({ input: stdin, output: stdout });

const loginId = (await rl.question('아이디: ')).trim();
const name = (await rl.question('이름: ')).trim();
const roleInput = (await rl.question('권한 (viewer / editor / owner) [editor]: ')).trim() || 'editor';
const password = (await rl.question('비밀번호 (10자 이상): ')).trim();
const again = (await rl.question('비밀번호 확인: ')).trim();
rl.close();

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
