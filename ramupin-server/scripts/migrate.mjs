// SQL 마이그레이션 실행: migrations/main → 본 DB, migrations/location → 위치 DB
// 각 DB 의 public.schema_migrations 에 적용한 파일 이름을 기록합니다. 이미 적용한 파일은 수정하지 말고 새 파일을 추가하세요.
//   npm run db:migrate
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const targets = [
  { name: 'main', url: process.env.MIGRATOR_MAIN_URL, dir: path.join(root, 'migrations', 'main') },
  { name: 'location', url: process.env.MIGRATOR_LOCATION_URL, dir: path.join(root, 'migrations', 'location') },
];

for (const target of targets) {
  if (!target.url) throw new Error(`MIGRATOR_${target.name.toUpperCase()}_URL 환경변수가 없습니다`);
  const client = new pg.Client({ connectionString: target.url });
  await client.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS public.schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const { rows } = await client.query('SELECT name FROM public.schema_migrations');
    const applied = new Set(rows.map((r) => r.name));
    const files = (await readdir(target.dir)).filter((f) => f.endsWith('.sql')).sort();

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(path.join(target.dir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO public.schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`[${target.name}] applied ${file}`);
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`[${target.name}] failed ${file}`);
        throw error;
      }
    }
    console.log(`[${target.name}] up to date (${files.length} files)`);
  } finally {
    await client.end();
  }
}
