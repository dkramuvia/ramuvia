// 테마 전환 뒤 훅 규칙을 어긴 곳이 없는지 봅니다.
//   node scripts/check-hooks.mjs
//
// 왜 필요한가: 전환 스크립트는 **대문자로 시작하는 함수**에 훅을 넣습니다.
// 그런데 대문자 함수가 항상 컴포넌트인 것은 아닙니다. 그냥 값을 돌려주는 도우미 함수에
// 훅이 들어가면, 그 함수를 조건문이나 반복문 안에서 부르는 순간 앱이 죽습니다.
// 타입 검사로는 안 잡히고, 그 화면에 들어가야만 드러납니다.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'node_modules' || name.startsWith('.')) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const problems = [];

for (const file of [...walk('app'), ...walk('src')]) {
  const text = readFileSync(file, 'utf8');
  if (!/useStyles\(\)|useColors\(\)/.test(text)) continue;

  const lines = text.split('\n');
  let current = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fn = /^\s*(?:export )?(?:default )?function ([A-Za-z_][A-Za-z0-9_]*)/.exec(line);
    if (fn) {
      current = { name: fn[1], line: i + 1, hasHook: false, returnsJsx: false };
      continue;
    }
    if (!current) continue;

    if (/\buse[A-Z][A-Za-z0-9_]*\(/.test(line)) current.hasHook = true;
    // JSX 를 그리면 컴포넌트로 봅니다.
    // `return (` 다음 줄에 태그가 오는 경우가 많아, 줄 하나만 보면 안 됩니다
    if (/<\/?[A-Z][A-Za-z0-9_.]*/.test(line) || /<\/>/.test(line)) current.returnsJsx = true;

    // 함수가 끝나는 지점(들여쓰기 없는 닫는 중괄호)
    if (/^\}/.test(line)) {
      if (current.hasHook && !current.returnsJsx) {
        problems.push(`${file}:${current.line}  ${current.name}() — 훅을 쓰는데 JSX 를 돌려주지 않습니다`);
      }
      current = null;
    }
  }
}

if (problems.length === 0) {
  console.log('훅 규칙 문제 없음');
} else {
  console.log(`살펴볼 곳 ${problems.length}개:`);
  for (const p of problems) console.log('  ' + p);
}
