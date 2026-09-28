// 색을 테마에 맞춰 쓰도록 파일을 바꿉니다 (다크 모드, docs/design-notes.md 참고).
//   node scripts/theme-convert.mjs --check src/...   바꿀 수 있는지만 봅니다
//   node scripts/theme-convert.mjs src/...           실제로 바꿉니다
//
// 하는 일
//   1. `const styles = StyleSheet.create({...})` → `const useStyles = makeStyles((colors) => ({...}))`
//   2. 컴포넌트 본문 첫 줄에 `const styles = useStyles();` / `const colors = useColors();`
//   3. `@/theme` import 정리
//
// **손대지 않는 것** — 그냥 바꾸면 테마를 따라가지 않으면서 오류도 안 나 조용히 틀리는 경우입니다.
//   - 컴포넌트 밖(모듈 맨 위)에서 색을 쓰는 파일 (`const variantStyles = { bg: colors.primary }`)
//   - 매개변수 기본값에 색을 쓰는 파일 (`function AppText({ color = colors.text })`)
//   - 이미 바꾼 파일
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const files = args.filter((a) => !a.startsWith('--'));

/** StyleSheet.create(...) 의 시작·끝. 정규식으로는 중첩 괄호를 못 셉니다 */
function findStyleBlock(text) {
  const start = text.indexOf('StyleSheet.create(');
  if (start < 0) return null;
  let depth = 0;
  for (let i = start + 'StyleSheet.create('.length - 1; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') {
      depth -= 1;
      if (depth === 0) return { start, end: i };
    }
  }
  return null;
}

/**
 * 파일 안 **모든** 컴포넌트 함수의 본문 시작 자리(여는 중괄호 다음 줄).
 *
 * 한 파일에 컴포넌트가 여럿인 경우가 많습니다 (화면 하나 + 그 안의 줄·카드).
 * 첫 번째에만 훅을 넣으면 나머지에서 styles·colors 를 못 찾습니다.
 *
 * 정규식으로 `function Foo(...)` 를 잡으면 매개변수 안의 `() => void` 에 걸려 끊겨서,
 * 괄호 짝을 직접 셉니다.
 */
function findComponentBodyStarts(text) {
  const starts = [];
  const re = /(?:export )?(?:default )?function ([A-Z][A-Za-z0-9_]*)\(/g;
  let head;
  while ((head = re.exec(text))) {
    let depth = 0;
    let i = head.index + head[0].length - 1;
    for (; i < text.length; i += 1) {
      if (text[i] === '(') depth += 1;
      else if (text[i] === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const brace = text.indexOf('{', i);
    if (brace < 0) continue;
    const lineEnd = text.indexOf('\n', brace);
    if (lineEnd < 0) continue;
    starts.push({ name: head[1], bodyStart: lineEnd + 1, end: text.length });
  }
  // 각 컴포넌트의 끝은 다음 컴포넌트가 시작하는 자리까지로 봅니다
  for (let i = 0; i < starts.length - 1; i += 1) starts[i].end = starts[i + 1].bodyStart;
  return starts;
}

const findComponentBodyStart = (text) => findComponentBodyStarts(text)[0]?.bodyStart ?? null;

const withoutImports = (s) => s.replace(/^import .*$/gm, '');

let changed = 0;
const skipped = [];

for (const file of files) {
  let text = readFileSync(file, 'utf8');
  if (!text.includes("from '@/theme'") || !/\bcolors\./.test(text)) continue;
  if (/useColors\(\)|makeStyles\(/.test(text)) continue; // 이미 바꾼 파일

  const bodyStart = findComponentBodyStart(text);
  if (bodyStart == null) {
    skipped.push(`${file} — 컴포넌트 함수를 찾지 못했습니다`);
    continue;
  }
  // 본문 시작 전에 색이 나오면 모듈 최상위이거나 매개변수 기본값입니다
  if (/\bcolors\./.test(withoutImports(text.slice(0, bodyStart)))) {
    skipped.push(`${file} — 컴포넌트 밖에서 색을 씁니다 (사람이 봐야 합니다)`);
    continue;
  }

  const block = findStyleBlock(text);
  const needsStyles = !!block && /\bcolors\./.test(text.slice(block.start, block.end)) && /\bstyles\./.test(text);
  const outside = block ? text.slice(0, block.start) + text.slice(block.end + 1) : text;
  const needsColors = /\bcolors\./.test(withoutImports(outside));

  if (checkOnly) {
    console.log(`${file}  스타일:${needsStyles ? 'O' : '-'} 렌더:${needsColors ? 'O' : '-'}`);
    continue;
  }
  if (!needsStyles && !needsColors) continue;

  // 1) StyleSheet.create → makeStyles (뒤에서부터 바꿔야 앞쪽 위치가 안 밀립니다)
  if (needsStyles) {
    const inner = text.slice(block.start + 'StyleSheet.create('.length, block.end);
    text = `${text.slice(0, block.start)}makeStyles((colors) => (${inner}))${text.slice(block.end + 1)}`;
    text = text.replace(/\bconst styles = makeStyles\(/, 'const useStyles = makeStyles(');
  }

  // 2) 컴포넌트마다 본문 첫 줄에 훅.
  //    뒤에서부터 넣어야 앞쪽 위치가 밀리지 않습니다.
  const components = findComponentBodyStarts(text);
  for (let i = components.length - 1; i >= 0; i -= 1) {
    const { bodyStart: at, end } = components[i];
    const body = text.slice(at, end);
    const hooks = [
      needsStyles && /\bstyles\./.test(body) ? '  const styles = useStyles();' : null,
      needsColors && /\bcolors\./.test(body) ? '  const colors = useColors();' : null,
    ]
      .filter(Boolean)
      .join('\n');
    if (hooks) text = text.slice(0, at) + hooks + '\n' + text.slice(at);
  }

  // 3) import 정리
  const want = [needsStyles ? 'makeStyles' : null, needsColors ? 'useColors' : null].filter(Boolean);
  text = text.replace(/import \{([^}]*)\} from '@\/theme';/, (_m, inside) => {
    const names = inside
      .split(',')
      .map((n) => n.trim())
      .filter((n) => n && n !== 'colors');
    for (const w of want) if (!names.includes(w)) names.push(w);
    return `import { ${names.sort().join(', ')} } from '@/theme';`;
  });

  writeFileSync(file, text);
  changed += 1;
}

if (!checkOnly) console.log(`${changed}개 파일을 바꿨습니다`);
if (skipped.length) {
  console.log('\n손대지 않은 파일:');
  for (const s of skipped) console.log('  ' + s);
}
