/**
 * 친구 추가 QR 코드 내용 (WBS 3.6).
 *
 * 앱 딥링크 형식이라, 기본 카메라 앱으로 찍어도 라무핀이 열립니다.
 *
 * **QR 에는 8자리 ID 를 넣지 않습니다.** QR 이미지는 한 번 찍히면 영원히 남습니다.
 * 카톡으로 보낸 QR, 단톡방에 올라간 사진, 어깨너머로 찍힌 화면이 전부 계속 유효한데,
 * 8자리 ID 는 바꿀 수 없어서 한번 새면 모르는 사람의 친구 요청을 계속 받게 됩니다.
 * 그래서 서버가 발급한 3분짜리 일회용 토큰만 넣습니다.
 */
const PREFIX = 'ramupin://friend/';

export function buildFriendQr(token: string): string {
  return `${PREFIX}${encodeURIComponent(token)}`;
}

/** 라무핀 친구 QR 이면 토큰, 아니면 null */
export function parseFriendQr(data: string): string | null {
  if (!data.startsWith(PREFIX)) return null;
  const token = decodeURIComponent(data.slice(PREFIX.length)).trim();
  return token || null;
}
