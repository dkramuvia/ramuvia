/**
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
  'boy-01': { normal: require('../../../assets/avatars/marker/boy-01.png'), me: require('../../../assets/avatars/marker/boy-01-me.png') },
  'boy-02': { normal: require('../../../assets/avatars/marker/boy-02.png'), me: require('../../../assets/avatars/marker/boy-02-me.png') },
  'boy-03': { normal: require('../../../assets/avatars/marker/boy-03.png'), me: require('../../../assets/avatars/marker/boy-03-me.png') },
  'boy-04': { normal: require('../../../assets/avatars/marker/boy-04.png'), me: require('../../../assets/avatars/marker/boy-04-me.png') },
  'boy-05': { normal: require('../../../assets/avatars/marker/boy-05.png'), me: require('../../../assets/avatars/marker/boy-05-me.png') },
  'boy-06': { normal: require('../../../assets/avatars/marker/boy-06.png'), me: require('../../../assets/avatars/marker/boy-06-me.png') },
  'boy-07': { normal: require('../../../assets/avatars/marker/boy-07.png'), me: require('../../../assets/avatars/marker/boy-07-me.png') },
  'boy-08': { normal: require('../../../assets/avatars/marker/boy-08.png'), me: require('../../../assets/avatars/marker/boy-08-me.png') },
  'boy-09': { normal: require('../../../assets/avatars/marker/boy-09.png'), me: require('../../../assets/avatars/marker/boy-09-me.png') },
  'boy-10': { normal: require('../../../assets/avatars/marker/boy-10.png'), me: require('../../../assets/avatars/marker/boy-10-me.png') },
  'boy-11': { normal: require('../../../assets/avatars/marker/boy-11.png'), me: require('../../../assets/avatars/marker/boy-11-me.png') },
  'boy-12': { normal: require('../../../assets/avatars/marker/boy-12.png'), me: require('../../../assets/avatars/marker/boy-12-me.png') },
  'boy-13': { normal: require('../../../assets/avatars/marker/boy-13.png'), me: require('../../../assets/avatars/marker/boy-13-me.png') },
  'boy-14': { normal: require('../../../assets/avatars/marker/boy-14.png'), me: require('../../../assets/avatars/marker/boy-14-me.png') },
  'boy-15': { normal: require('../../../assets/avatars/marker/boy-15.png'), me: require('../../../assets/avatars/marker/boy-15-me.png') },
  'boy-16': { normal: require('../../../assets/avatars/marker/boy-16.png'), me: require('../../../assets/avatars/marker/boy-16-me.png') },
  'boy-17': { normal: require('../../../assets/avatars/marker/boy-17.png'), me: require('../../../assets/avatars/marker/boy-17-me.png') },
  'boy-18': { normal: require('../../../assets/avatars/marker/boy-18.png'), me: require('../../../assets/avatars/marker/boy-18-me.png') },
  'girl-01': { normal: require('../../../assets/avatars/marker/girl-01.png'), me: require('../../../assets/avatars/marker/girl-01-me.png') },
  'girl-02': { normal: require('../../../assets/avatars/marker/girl-02.png'), me: require('../../../assets/avatars/marker/girl-02-me.png') },
  'girl-03': { normal: require('../../../assets/avatars/marker/girl-03.png'), me: require('../../../assets/avatars/marker/girl-03-me.png') },
  'girl-04': { normal: require('../../../assets/avatars/marker/girl-04.png'), me: require('../../../assets/avatars/marker/girl-04-me.png') },
  'girl-05': { normal: require('../../../assets/avatars/marker/girl-05.png'), me: require('../../../assets/avatars/marker/girl-05-me.png') },
  'girl-06': { normal: require('../../../assets/avatars/marker/girl-06.png'), me: require('../../../assets/avatars/marker/girl-06-me.png') },
  'girl-07': { normal: require('../../../assets/avatars/marker/girl-07.png'), me: require('../../../assets/avatars/marker/girl-07-me.png') },
  'girl-08': { normal: require('../../../assets/avatars/marker/girl-08.png'), me: require('../../../assets/avatars/marker/girl-08-me.png') },
  'girl-09': { normal: require('../../../assets/avatars/marker/girl-09.png'), me: require('../../../assets/avatars/marker/girl-09-me.png') },
  'girl-10': { normal: require('../../../assets/avatars/marker/girl-10.png'), me: require('../../../assets/avatars/marker/girl-10-me.png') },
  'girl-11': { normal: require('../../../assets/avatars/marker/girl-11.png'), me: require('../../../assets/avatars/marker/girl-11-me.png') },
  'girl-12': { normal: require('../../../assets/avatars/marker/girl-12.png'), me: require('../../../assets/avatars/marker/girl-12-me.png') },
  'girl-13': { normal: require('../../../assets/avatars/marker/girl-13.png'), me: require('../../../assets/avatars/marker/girl-13-me.png') },
  'girl-14': { normal: require('../../../assets/avatars/marker/girl-14.png'), me: require('../../../assets/avatars/marker/girl-14-me.png') },
  'girl-15': { normal: require('../../../assets/avatars/marker/girl-15.png'), me: require('../../../assets/avatars/marker/girl-15-me.png') },
  'girl-16': { normal: require('../../../assets/avatars/marker/girl-16.png'), me: require('../../../assets/avatars/marker/girl-16-me.png') },
  'girl-17': { normal: require('../../../assets/avatars/marker/girl-17.png'), me: require('../../../assets/avatars/marker/girl-17-me.png') },
  'girl-18': { normal: require('../../../assets/avatars/marker/girl-18.png'), me: require('../../../assets/avatars/marker/girl-18-me.png') },
  'girl-19': { normal: require('../../../assets/avatars/marker/girl-19.png'), me: require('../../../assets/avatars/marker/girl-19-me.png') },
  'girl-20': { normal: require('../../../assets/avatars/marker/girl-20.png'), me: require('../../../assets/avatars/marker/girl-20-me.png') },
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
