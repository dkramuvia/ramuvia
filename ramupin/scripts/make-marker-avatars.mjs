// 지도 마커용 **원형 캐릭터 그림**을 미리 만듭니다.
//   node scripts/make-marker-avatars.mjs
//
// **왜 미리 만드는가**
// 안드로이드 지도는 마커를 뷰로 받으면 그림 한 장으로 굽는데, 그때 `<Image>` 가
// 통째로 빠집니다 (계속 다시 굽기·다시 만들기·페이드 끄기·잘라내기 해제를 모두
// 해 봤지만 그대로였습니다 — 2026-10-01). 대신 **그림 파일을 마커 아이콘으로**
// 넘기면 그대로 나옵니다. 그래서 둥글게 자르고 테두리를 두른 그림을 미리 만들어 둡니다.
//
// 결과: assets/avatars/marker/<이름>.png (테두리 흰색), <이름>-me.png (테두리 강조색)
import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Jimp, intToRGBA, rgbaToInt } from 'jimp';

const 뿌리 = dirname(dirname(fileURLToPath(import.meta.url)));
const 원본폴더 = join(뿌리, 'assets/avatars');
const 결과폴더 = join(원본폴더, 'marker');

/**
 * 크기는 **픽셀**입니다. 안드로이드 마커 아이콘은 그림을 그대로 쓰므로
 * 화면 배율을 우리가 계산해 둡니다 — 44dp 마커 × 3배 화면 = 132px.
 */
const 지름 = 132;
/** 테두리 두께 (3dp × 3) */
const 테두리 = 9;

const 흰색 = rgbaToInt(255, 255, 255, 255);
/** 내 마커 테두리 (theme 의 primary 와 같은 색) */
const 강조 = rgbaToInt(0, 149, 255, 255);

/** 가운데를 원으로 남기고 바깥은 테두리색, 그 바깥은 투명하게 */
function 둥글게(이미지, 테두리색) {
  const 반지름 = 지름 / 2;
  const 안쪽반지름 = 반지름 - 테두리;
  for (let y = 0; y < 지름; y += 1) {
    for (let x = 0; x < 지름; x += 1) {
      const dx = x - 반지름 + 0.5;
      const dy = y - 반지름 + 0.5;
      const 거리 = Math.sqrt(dx * dx + dy * dy);
      if (거리 > 반지름) {
        // 원 바깥 — 투명
        이미지.setPixelColor(rgbaToInt(0, 0, 0, 0), x, y);
      } else if (거리 > 안쪽반지름) {
        // 테두리. 가장자리 한 픽셀은 반투명하게 섞어 계단을 줄입니다
        const 알파 = Math.min(1, 반지름 - 거리) * 255;
        const c = intToRGBA(테두리색);
        이미지.setPixelColor(rgbaToInt(c.r, c.g, c.b, Math.round(알파)), x, y);
      }
    }
  }
  return 이미지;
}

mkdirSync(결과폴더, { recursive: true });

const 파일들 = readdirSync(원본폴더).filter((f) => /\.(jpg|jpeg|png)$/i.test(f));
if (파일들.length === 0) throw new Error(`${원본폴더} 에 캐릭터 그림이 없습니다`);

let 만든수 = 0;
for (const 파일 of 파일들) {
  const 이름 = 파일.replace(/\.[^.]+$/, '');
  for (const [꼬리, 색] of [['', 흰색], ['-me', 강조]]) {
    const 원본 = await Jimp.read(join(원본폴더, 파일));
    원본.cover({ w: 지름, h: 지름 });
    둥글게(원본, 색);
    writeFileSync(join(결과폴더, `${이름}${꼬리}.png`), await 원본.getBuffer('image/png'));
    만든수 += 1;
  }
}

console.log(`${만든수}개 만들었습니다 → assets/avatars/marker/ (${지름}px)`);
