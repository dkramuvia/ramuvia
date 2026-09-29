// 피그마에서 받은 그림에서 실제로 많이 쓰인 색을 뽑습니다.
//   node scripts/sample-colors.mjs <그림.png>
//
// 왜 이렇게 하나: 피그마 파일 조회가 속도 제한에 걸리면 색 값을 직접 못 읽습니다.
// 그럴 때 화면 그림만 받아(이미지는 다른 통로라 열려 있습니다) 픽셀에서 색을 셉니다.
// 배경·카드처럼 넓게 칠한 색은 이 방법으로도 정확합니다.
import { readFileSync } from 'node:fs';

import { PNG } from 'pngjs';

const file = process.argv[2];
if (!file) throw new Error('그림 파일을 주세요');

const png = PNG.sync.read(readFileSync(file));
const counts = new Map();

/** 피그마 캔버스 바탕(검정)과 섹션 바탕(자주색)은 앱 색이 아니라 뺍니다 */
function isCanvas(r, g, b) {
  if (r < 8 && g < 8 && b < 8) return true; // 캔버스 검정
  if (r > 100 && r < 160 && g < 70 && b > 70 && b < 120) return true; // 섹션 자주색
  return false;
}

for (let i = 0; i < png.data.length; i += 4) {
  const [r, g, b, a] = [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
  if (a < 250 || isCanvas(r, g, b)) continue;
  // 비슷한 색을 한 덩어리로 묶습니다 (그림을 줄이면서 생긴 미세한 차이를 없앰)
  const key = `${r >> 2 << 2},${g >> 2 << 2},${b >> 2 << 2}`;
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

const total = [...counts.values()].reduce((a, b) => a + b, 0);
const hex = (k) =>
  '#' +
  k
    .split(',')
    .map((v) => Number(v).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);

console.log('=== 어두운 색 (앱 배경·카드로 쓰였을 것) ===');
for (const [k, n] of sorted.filter(([k]) => k.split(',').every((v) => Number(v) < 90)).slice(0, 12)) {
  console.log(`  ${hex(k)}  ${((n / total) * 100).toFixed(1)}%`);
}

console.log('\n=== 밝은 색 (글자로 쓰였을 것) ===');
for (const [k, n] of sorted.filter(([k]) => k.split(',').every((v) => Number(v) > 160)).slice(0, 8)) {
  console.log(`  ${hex(k)}  ${((n / total) * 100).toFixed(1)}%`);
}
