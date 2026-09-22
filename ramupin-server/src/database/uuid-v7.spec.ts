import { describe, expect, it } from 'vitest';

/**
 * 기본키 생성 규칙 (2026-09-22).
 *
 * 새 표를 만들 때 `gen_random_uuid()` 를 쓰면 안 됩니다. 완전 난수라 새 행이 인덱스
 * 여기저기에 꽂혀 행이 많아질수록 쓰기가 느려집니다. UUIDv7 은 앞 48비트가 시각이라
 * 만들어진 순서대로 정렬됩니다.
 *
 * 기본키는 데이터가 쌓이면 바꿀 수 없어, 규칙을 여기에 고정합니다.
 * 마이그레이션에서 실수로 v4 를 쓰면 이 테스트가 잡아 줍니다.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(import.meta.dirname, '..', '..', 'migrations');

function sqlFiles(): { name: string; sql: string }[] {
  const out: { name: string; sql: string }[] = [];
  for (const target of ['main', 'location']) {
    const dir = join(MIGRATIONS, target);
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
      out.push({ name: `${target}/${file}`, sql: readFileSync(join(dir, file), 'utf8') });
    }
  }
  return out;
}

describe('기본키 생성 규칙', () => {
  it('새 마이그레이션에서 gen_random_uuid() 를 기본값으로 쓰지 않는다', () => {
    // 0001~0016 은 v7 도입 전이고 0018 에서 전부 바꿨습니다. 그 뒤로만 검사합니다
    const offenders = sqlFiles()
      .filter((f) => {
        const num = Number(f.name.split('/')[1].slice(0, 4));
        return f.name.startsWith('main/') && num > 18;
      })
      .filter((f) => /DEFAULT\s+gen_random_uuid\(\)/i.test(f.sql))
      .map((f) => f.name);

    expect(offenders, `UUIDv7 을 쓰세요: ${offenders.join(', ')}`).toEqual([]);
  });

  it('v7 함수와 적용 마이그레이션이 저장소에 있다', () => {
    const names = sqlFiles().map((f) => f.name);
    expect(names).toContain('main/0017_uuid_v7.sql');
    expect(names).toContain('main/0018_uuid_v7_defaults.sql');
  });
});
