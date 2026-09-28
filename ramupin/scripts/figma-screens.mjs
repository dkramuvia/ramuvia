// 피그마 화면 목록을 뽑아 docs/figma-screens.md 를 다시 씁니다.
//   node scripts/figma-screens.mjs            (light mode 페이지)
//   node scripts/figma-screens.mjs 417:9066   (다른 페이지)
//
// 왜 필요한가: 디자인은 계속 바뀌는데 코드는 한 번 옮기면 그대로입니다.
// 무엇이 바뀌었는지 눈으로 찾으면 반드시 빠뜨립니다. 목록을 파일로 만들어 두면
// git diff 만으로 "이번에 바뀐 화면" 이 그대로 보입니다.
//
// 토큰은 .env 의 FIGMA_TOKEN 에서 읽습니다 (피그마 > Settings > Security > Personal access tokens).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const FILE_KEY = 'B7PL60U8Z0122RaYWOjLWw';
const PAGE_ID = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? '99:31432'; // light mode (prototyping)
const OUT = new URL('../docs/figma-screens.md', import.meta.url);

const token = /^FIGMA_TOKEN=(.+)$/m.exec(readFileSync(new URL('../.env', import.meta.url), 'utf8'))?.[1]?.trim();
if (!token) throw new Error('.env 에 FIGMA_TOKEN 이 없습니다');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 피그마는 짧은 시간에 여러 번 부르면 429 로 막습니다.
 * 섹션이 11개라 그냥 돌리면 중간에 끊기므로, 막히면 기다렸다 다시 부릅니다.
 */
const api = async (path, attempt = 1) => {
  const r = await fetch(`https://api.figma.com/v1${path}`, { headers: { 'X-Figma-Token': token } });
  if (r.status === 429 && attempt <= 6) {
    const wait = 15_000 * attempt;
    console.log(`  (속도 제한 — ${wait / 1000}초 쉬었다 다시)`);
    await sleep(wait);
    return api(path, attempt + 1);
  }
  if (!r.ok) throw new Error(`피그마 ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
};

/** 한 화면 안의 글자를 모두 모읍니다. 디자인이 바뀌면 글자부터 달라집니다 */
function collectText(node, out = []) {
  if (node.type === 'TEXT' && node.characters) {
    const text = node.characters.replace(/\s+/g, ' ').trim();
    if (text && !out.includes(text)) out.push(text);
  }
  for (const child of node.children ?? []) collectText(child, out);
  return out;
}

const link = (id) => `https://www.figma.com/design/${FILE_KEY}?node-id=${id.replace(':', '-')}`;

/**
 * 페이지 하나를 통째로 한 번에 받습니다.
 *
 * 섹션마다 따로 부르면 피그마가 속도 제한으로 막습니다 (11번이면 걸립니다).
 * `ids` 로 한 페이지만 집으면 파일 전체보다 훨씬 작고, 호출도 한 번이면 끝납니다.
 * 받은 것은 파일로 남겨, 다시 돌릴 때 또 부르지 않습니다.
 */
const CACHE = new URL('../../figma-page-cache.json', import.meta.url);
let file;
if (process.argv.includes('--cache') && existsSync(CACHE)) {
  console.log('(받아 둔 것을 씁니다)');
  file = JSON.parse(readFileSync(CACHE, 'utf8'));
} else {
  file = await api(`/files/${FILE_KEY}?ids=${PAGE_ID}`);
  writeFileSync(CACHE, JSON.stringify(file));
}

const page = file.document.children.find((p) => p.id === PAGE_ID);
if (!page) throw new Error(`페이지 ${PAGE_ID} 를 찾지 못했습니다`);

const sections = page.children.filter((c) => c.type === 'SECTION');
console.log(`${page.name}: 섹션 ${sections.length}개`);

const lines = [
  `# 라무핀 v2.0 피그마 화면 목록`,
  '',
  `> 피그마 \`${page.name}\` 페이지에서 뽑은 것입니다 (\`node scripts/figma-screens.mjs\`).`,
  `> 화면 이름 옆 링크를 누르면 피그마의 해당 프레임으로 갑니다.`,
  '',
];

let total = 0;
for (const section of sections) {
  const frames = (section.children ?? []).filter((c) => c.type === 'FRAME' || c.type === 'COMPONENT');

  lines.push(`## ${section.name}`, '');
  for (const frame of frames) {
    const text = collectText(frame).join(' · ');
    lines.push(`- [${frame.name}](${link(frame.id)})${text ? ` — ${text}` : ''}`);
    total += 1;
  }
  lines.push('');
  console.log(`  ${section.name}: ${frames.length}개`);
}

writeFileSync(OUT, lines.join('\n'));
console.log(`\n화면 ${total}개를 docs/figma-screens.md 에 적었습니다`);
