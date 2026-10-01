// `src/features/map/markerAvatars.ts` 를 만듭니다 (캐릭터를 추가하면 다시 돌리세요).
//   node scripts/make-marker-avatars.mjs      그림 먼저
//   node scripts/gen-marker-avatar-list.mjs   그다음 목록
//
// Metro 는 `require()` 안에 변수를 못 씁니다. 그래서 캐릭터 수만큼 줄을 펼쳐 둡니다.
import { readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const 뿌리 = dirname(dirname(fileURLToPath(import.meta.url)));
const 이름들 = readdirSync(join(뿌리, 'assets/avatars'))
  .filter((f) => /\.(jpg|jpeg|png)$/i.test(f))
  .map((f) => f.replace(/\.[^.]+$/, ''))
  .sort();

const 줄 = 이름들
  .map(
    (n) =>
      `  '${n}': { normal: require('../../../assets/avatars/marker/${n}.png'), me: require('../../../assets/avatars/marker/${n}-me.png') },`,
  )
  .join('\n');

const 내용 = `/**
 * 지도 마커용 **원형 캐릭터 그림**.
 *
 * 안드로이드 지도는 마커를 뷰로 받으면 그림 한 장으로 굽는데, 그때 이미지가 통째로
 * 빠집니다 (2026-10-01 폰에서 확인 — 계속 다시 굽기·마커 다시 만들기·페이드 끄기·
 * 잘라내기 해제를 모두 해 봤지만 그대로였습니다). 대신 **그림 파일을 마커 아이콘으로**
 * 넘기면 그대로 나옵니다.
 *
 * 그래서 둥글게 자르고 테두리를 두른 그림을 미리 만들어 둡니다
 * (132px = 44dp x 3배 화면). 만드는 스크립트: scripts/make-marker-avatars.mjs
 *
 * **이 파일은 스크립트가 만든 목록입니다** — 손으로 고치지 말고
 * scripts/gen-marker-avatar-list.mjs 를 다시 돌리세요.
 */
const PREFIX = 'avatar:';

const MARKER: Record<string, { normal: number; me: number }> = {
${줄}
};

/**
 * 캐릭터 키를 마커용 그림으로 바꿉니다.
 * 캐릭터가 아니면(올린 사진이거나 없음) undefined — 그때는 이름 두 글자 마커로 갑니다.
 */
export function markerAvatarSource(avatarUrl: string | undefined, isMe: boolean): number | undefined {
  if (!avatarUrl?.startsWith(PREFIX)) return undefined;
  const entry = MARKER[avatarUrl.slice(PREFIX.length)];
  if (!entry) return undefined;
  return isMe ? entry.me : entry.normal;
}
`;

writeFileSync(join(뿌리, 'src/features/map/markerAvatars.ts'), 내용);
console.log(`markerAvatars.ts 만들었습니다 — 캐릭터 ${이름들.length}개`);
