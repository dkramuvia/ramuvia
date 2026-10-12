import { Jimp, rgbaToInt } from 'jimp';

/**
 * 프로필 사진으로 **지도 핀 그림**을 만듭니다.
 *
 * 안드로이드 지도는 마커를 그림 한 장으로 굽는데, 그때 인터넷에서 받는 사진이 빠져서
 * 사진 프로필인 사람은 지도에 이름 핀으로만 나왔습니다 (10-12). 그림 파일을 마커 아이콘으로
 * 넘기면 그대로 나오므로, 캐릭터 핀과 똑같은 모양의 그림을 서버가 미리 만들어 둡니다.
 *
 * **모양은 앱 scripts/make-marker-avatars.mjs 와 같아야 합니다** — 40dp 원 + 아래로 뾰족한 꼬리
 * (12×16dp), 전체 40×52dp, 3배 화면 기준 픽셀. 고치면 둘 다 고칩니다.
 */

const SCALE = 3;
const WIDTH = 40 * SCALE;
const HEIGHT = 52 * SCALE;
const DIAMETER = 40 * SCALE;
/** 꼬리: 위쪽 너비 12dp (x 14~26), 위 끝 y 36dp, 뾰족한 끝 y 52dp */
const TAIL = { left: 14 * SCALE, right: 26 * SCALE, top: 36 * SCALE, tip: 52 * SCALE };
/** 피그마 값: 테두리·꼬리 #e5e5e5 1dp */
const GREY: [number, number, number] = [0xe5, 0xe5, 0xe5];
/** 활성화된 사람 테두리 (앱 theme 의 primary). 눈에 띄게 2dp */
const ACCENT: [number, number, number] = [0, 149, 255];

/** 한 픽셀을 4×4 로 쪼개 얼마나 덮이는지 셉니다 (가장자리 계단 줄이기) */
function coverage(inside: (x: number, y: number) => boolean, x: number, y: number) {
  let n = 0;
  for (let i = 0; i < 4; i += 1) for (let j = 0; j < 4; j += 1) if (inside(x + (i + 0.5) / 4, y + (j + 0.5) / 4)) n += 1;
  return n / 16;
}

const inCircle = (r: number) => (x: number, y: number) => (x - DIAMETER / 2) ** 2 + (y - DIAMETER / 2) ** 2 <= r * r;
const inTail = (x: number, y: number) => {
  if (y < TAIL.top || y > TAIL.tip) return false;
  const t = (y - TAIL.top) / (TAIL.tip - TAIL.top);
  return Math.abs(x - WIDTH / 2) <= ((TAIL.right - TAIL.left) / 2) * (1 - t);
};

type Photo = Awaited<ReturnType<typeof Jimp.read>>;

function pin(photo: Photo, border: [number, number, number], borderDp: number) {
  const out = new Jimp({ width: WIDTH, height: HEIGHT, color: 0x00000000 });
  const outer = inCircle(DIAMETER / 2);
  const inner = inCircle(DIAMETER / 2 - borderDp * SCALE);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const circle = coverage(outer, x, y);
      const image = coverage(inner, x, y);
      const tail = circle > 0 ? 0 : coverage(inTail, x, y);
      if (circle === 0 && tail === 0) continue;
      if (tail > 0) {
        out.setPixelColor(rgbaToInt(...GREY, Math.round(tail * 255)), x, y);
        continue;
      }
      // 안쪽은 사진, 그 바깥 띠는 테두리색. 경계는 섞습니다
      const p = image > 0 ? photo.getPixelColor(x, y) : 0;
      const r = Math.round(((p >>> 24) & 255) * image + border[0] * (1 - image));
      const g = Math.round(((p >>> 16) & 255) * image + border[1] * (1 - image));
      const b = Math.round(((p >>> 8) & 255) * image + border[2] * (1 - image));
      out.setPixelColor(rgbaToInt(r, g, b, Math.round(circle * 255)), x, y);
    }
  }
  return out.getBuffer('image/png');
}

/** 사진 → 핀 그림 두 장 (보통 · 활성화). 읽을 수 없는 사진이면 예외 */
export async function makeAvatarPins(photoBytes: Buffer): Promise<{ normal: Buffer; active: Buffer }> {
  const photo = await Jimp.read(photoBytes);
  photo.cover({ w: DIAMETER, h: DIAMETER });
  // 테두리 두께가 달라 사진을 두 번 쓰므로 원본을 그대로 넘깁니다 (pin 은 사진을 바꾸지 않습니다)
  return { normal: await pin(photo, GREY, 1), active: await pin(photo, ACCENT, 2) };
}

/** 프로필 사진 주소 → 핀 그림 주소. 앱 markerAvatars.ts 의 photoPinUrl 과 같은 규칙입니다 */
export const pinObjectKeys = (avatarKey: string) => {
  const base = avatarKey.replace(/\.[a-z]+$/, '');
  return { normal: `${base}-pin.png`, active: `${base}-pin-active.png` };
};
