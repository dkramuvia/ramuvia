// 피그마 화면 하나의 속을 들여다봅니다 (색·크기·글자·간격).
//   node scripts/figma-inspect.mjs 839-42226          한 화면
//   node scripts/figma-inspect.mjs 839-42226 --depth 4
//
// 화면을 그림으로 보면 색과 간격을 눈대중하게 됩니다. 값을 그대로 읽어 옮기는 편이
// 빠르고 정확합니다. 받아 둔 원본(figma-page-cache.json)만 읽고 피그마를 부르지 않습니다.
import { existsSync, readFileSync } from 'node:fs';

const CACHE = new URL('../../figma-page-cache.json', import.meta.url);
if (!existsSync(CACHE)) throw new Error('figma-page-cache.json 이 없습니다. scripts/figma-screens.mjs 를 먼저 돌리세요');

const target = (process.argv[2] ?? '').replace('-', ':');
const depthArg = process.argv.indexOf('--depth');
const MAX_DEPTH = depthArg > 0 ? Number(process.argv[depthArg + 1]) : 6;

const file = JSON.parse(readFileSync(CACHE, 'utf8'));

/** 0~1 색을 #RRGGBB 로 */
const hex = (c) =>
  '#' +
  [c.r, c.g, c.b]
    .map((v) => Math.round(v * 255).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

function paint(fills) {
  const solid = (fills ?? []).find((f) => f.type === 'SOLID' && f.visible !== false);
  if (!solid) return '';
  const alpha = solid.opacity != null && solid.opacity < 1 ? ` ${Math.round(solid.opacity * 100)}%` : '';
  return hex(solid.color) + alpha;
}

/** 이 화면에서 무엇을 읽어야 하는지만 추립니다 */
function describe(node) {
  const bits = [];
  const b = node.absoluteBoundingBox;
  if (b) bits.push(`${Math.round(b.width)}x${Math.round(b.height)}`);
  const fill = paint(node.fills);
  if (fill) bits.push(`채움 ${fill}`);
  const stroke = paint(node.strokes);
  if (stroke) bits.push(`선 ${stroke} ${node.strokeWeight ?? 1}`);
  if (node.cornerRadius) bits.push(`모서리 ${node.cornerRadius}`);
  if (node.layoutMode && node.layoutMode !== 'NONE') {
    bits.push(`${node.layoutMode === 'VERTICAL' ? '세로' : '가로'} 간격 ${node.itemSpacing ?? 0}`);
    const pad = [node.paddingTop, node.paddingRight, node.paddingBottom, node.paddingLeft].map((v) => v ?? 0);
    if (pad.some((v) => v)) bits.push(`안쪽 ${pad.join('/')}`);
  }
  if (node.type === 'TEXT') {
    const s = node.style ?? {};
    bits.push(`${s.fontSize ?? '?'}px/${s.lineHeightPx ? Math.round(s.lineHeightPx) : '?'} ${s.fontWeight ?? ''}`);
  }
  return bits.join(' · ');
}

function walk(node, depth = 0, parentBox = null) {
  if (depth > MAX_DEPTH) return;
  if (node.visible === false) return;

  const indent = '  '.repeat(depth);
  const b = node.absoluteBoundingBox;
  const pos = b && parentBox ? ` @${Math.round(b.x - parentBox.x)},${Math.round(b.y - parentBox.y)}` : '';
  const text = node.type === 'TEXT' && node.characters ? ` "${node.characters.replace(/\s+/g, ' ').slice(0, 40)}"` : '';

  console.log(`${indent}${node.type === 'TEXT' ? '가' : '▫'} ${node.name}${text}${pos} — ${describe(node)}`);
  for (const child of node.children ?? []) walk(child, depth + 1, b ?? parentBox);
}

function find(node) {
  if (node.id === target) return node;
  for (const child of node.children ?? []) {
    const hit = find(child);
    if (hit) return hit;
  }
  return null;
}

if (!target) {
  // 대상을 안 주면 섹션·화면 목록만 보여 줍니다
  const page = file.document.children[0];
  for (const section of (page.children ?? []).filter((c) => c.type === 'SECTION')) {
    console.log(`\n## ${section.name}`);
    for (const frame of (section.children ?? []).filter((c) => c.type === 'FRAME' || c.type === 'COMPONENT')) {
      console.log(`  ${frame.id.replace(':', '-')}  ${frame.name}`);
    }
  }
} else {
  const node = find(file.document);
  if (!node) throw new Error(`${target} 를 찾지 못했습니다`);
  walk(node);
}
