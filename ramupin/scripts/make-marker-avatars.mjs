// 지도 마커용 **핀 모양 캐릭터 그림**을 미리 만듭니다.
//   node scripts/make-marker-avatars.mjs
//
// **왜 미리 만드는가**
// 안드로이드 지도는 마커를 뷰로 받으면 그림 한 장으로 굽는데, 그때 `<Image>` 가
// 통째로 빠집니다 (계속 다시 굽기·다시 만들기·페이드 끄기·잘라내기 해제를 모두
// 해 봤지만 그대로였습니다 — 2026-10-01). 대신 **그림 파일을 마커 아이콘으로**
// 넘기면 그대로 나옵니다. 그래서 둥글게 자르고 테두리를 두른 그림을 미리 만들어 둡니다.
//
// **모양** (피그마 `Component 20` · 속성 1=사진/아바타, 2026-10-07)
//   40dp 원 + 아래로 뾰족한 꼬리(12×16dp). 전체 40×52dp, **꼬리 끝이 위치 좌표**입니다.
//
// 결과: assets/avatars/marker/<이름>.png (회색 테두리), <이름>-me.png (강조색 테두리)
import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Jimp, rgbaToInt } from 'jimp';

const 뿌리 = dirname(dirname(fileURLToPath(import.meta.url)));
const 원본폴더 = join(뿌리, 'assets/avatars');
const 결과폴더 = join(원본폴더, 'marker');

/**
 * 크기는 **픽셀**입니다. 안드로이드 마커 아이콘은 그림을 그대로 쓰므로
 * 화면 배율을 우리가 계산해 둡니다 — 3배 화면 기준.
 * 앱 쪽 같은 값: src/features/map/PinMarker.tsx 의 PIN
 */
const 배율 = 3;
const 너비 = 40 * 배율;
const 높이 = 52 * 배율;
const 지름 = 40 * 배율;
/** 꼬리: 위쪽 너비 12dp (x 14~26), 위 끝 y 36dp, 뾰족한 끝 y 52dp */
const 꼬리 = { 왼쪽: 14 * 배율, 오른쪽: 26 * 배율, 위: 36 * 배율, 끝: 52 * 배율 };

/** 피그마 값: 바탕 #f5f5f5 위 테두리 #e5e5e5 1dp. 꼬리도 #e5e5e5 */
const 회색 = [0xe5, 0xe5, 0xe5];
/** 내 마커 테두리 (theme 의 primary 와 같은 색). 눈에 띄게 2dp */
const 강조 = [0, 149, 255];

/** 한 픽셀을 4×4 로 쪼개 얼마나 덮이는지 셉니다 (가장자리 계단 줄이기) */
function 덮임(안에있나, x, y) {
  let n = 0;
  for (let i = 0; i < 4; i += 1) for (let j = 0; j < 4; j += 1) if (안에있나(x + (i + 0.5) / 4, y + (j + 0.5) / 4)) n += 1;
  return n / 16;
}

const 원안 = (r) => (x, y) => (x - 지름 / 2) ** 2 + (y - 지름 / 2) ** 2 <= r * r;
/** 꼬리 삼각형: 위 변(왼쪽~오른쪽)에서 끝점까지 좁아집니다 */
const 꼬리안 = (x, y) => {
  if (y < 꼬리.위 || y > 꼬리.끝) return false;
  const t = (y - 꼬리.위) / (꼬리.끝 - 꼬리.위);
  const 반폭 = ((꼬리.오른쪽 - 꼬리.왼쪽) / 2) * (1 - t);
  return Math.abs(x - 너비 / 2) <= 반폭;
};

function 핀(캐릭터, 테두리색, 테두리dp) {
  const 결과 = new Jimp({ width: 너비, height: 높이, color: 0x00000000 });
  const 바깥 = 원안(지름 / 2);
  const 안쪽 = 원안(지름 / 2 - 테두리dp * 배율);
  for (let y = 0; y < 높이; y += 1) {
    for (let x = 0; x < 너비; x += 1) {
      const 원 = 덮임(바깥, x, y);
      const 그림 = 덮임(안쪽, x, y);
      const 꼬리몫 = 원 > 0 ? 0 : 덮임(꼬리안, x, y);
      if (원 === 0 && 꼬리몫 === 0) continue;
      if (꼬리몫 > 0) {
        결과.setPixelColor(rgbaToInt(...회색, Math.round(꼬리몫 * 255)), x, y);
        continue;
      }
      // 안쪽은 캐릭터, 그 바깥 띠는 테두리색. 경계는 섞습니다
      const p = 그림 > 0 ? 캐릭터.getPixelColor(x, y) : 0;
      const cr = (p >>> 24) & 255;
      const cg = (p >>> 16) & 255;
      const cb = (p >>> 8) & 255;
      const r = Math.round(cr * 그림 + 테두리색[0] * (1 - 그림));
      const g = Math.round(cg * 그림 + 테두리색[1] * (1 - 그림));
      const b = Math.round(cb * 그림 + 테두리색[2] * (1 - 그림));
      결과.setPixelColor(rgbaToInt(r, g, b, Math.round(원 * 255)), x, y);
    }
  }
  return 결과;
}

mkdirSync(결과폴더, { recursive: true });

const 파일들 = readdirSync(원본폴더).filter((f) => /\.(jpg|jpeg|png)$/i.test(f));
if (파일들.length === 0) throw new Error(`${원본폴더} 에 캐릭터 그림이 없습니다`);

let 만든수 = 0;
for (const 파일 of 파일들) {
  const 이름 = 파일.replace(/\.[^.]+$/, '');
  for (const [붙임, 색, 두께] of [['', 회색, 1], ['-me', 강조, 2]]) {
    const 원본 = await Jimp.read(join(원본폴더, 파일));
    원본.cover({ w: 지름, h: 지름 });
    writeFileSync(join(결과폴더, `${이름}${붙임}.png`), await 핀(원본, 색, 두께).getBuffer('image/png'));
    만든수 += 1;
  }
}

console.log(`${만든수}개 만들었습니다 → assets/avatars/marker/ (${너비}x${높이}px)`);
