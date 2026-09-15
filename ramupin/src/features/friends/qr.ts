/**
 * 친구 추가 QR 코드 내용.
 * 앱 딥링크 형식으로 만들어서, 기본 카메라 앱으로 찍어도 라무핀이 열리게 합니다.
 * TODO(5단계): 서버 발급 일회용 토큰으로 교체 (ID 노출 최소화)
 */
const PREFIX = 'ramupin://friend/';

export function buildFriendQr(userId: string): string {
  return `${PREFIX}${encodeURIComponent(userId)}`;
}

/** 라무핀 친구 QR 이면 사용자 ID, 아니면 null */
export function parseFriendQr(data: string): string | null {
  if (!data.startsWith(PREFIX)) return null;
  const id = decodeURIComponent(data.slice(PREFIX.length)).trim();
  return id || null;
}
