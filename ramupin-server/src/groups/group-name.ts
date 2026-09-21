/**
 * 방 이름을 보는 사람 기준으로 정합니다 (카카오톡·LINE 과 같은 방식).
 *
 * 1:1 방은 이름 없이 만들어지고(`is_direct`), 여러 명 방도 이름을 비워 둘 수 있습니다.
 * 그대로 내려주면 화면에 빈칸이 나옵니다 (09-21 갤러리에서 실제로 겪었습니다).
 *
 * 이름을 쓰는 곳이 여러 군데(그룹 목록·채팅·갤러리)라 규칙을 여기 한 곳에 둡니다.
 */

/** 이름을 다 나열하지 않고 이만큼만 보여 준 뒤 "외 N명" */
const MAX_NAMES = 3;

export interface NamedMember {
  id: string;
  nickname: string;
}

export function displayGroupName(input: { name: string; members: NamedMember[]; viewerId: string }): string {
  const name = input.name?.trim();
  if (name) return name;

  const others = input.members.filter((m) => m.id !== input.viewerId);
  // 다 나가고 나만 남은 방
  if (others.length === 0) return '나';

  const shown = others.slice(0, MAX_NAMES).map((m) => m.nickname);
  const rest = others.length - shown.length;
  return rest > 0 ? `${shown.join(', ')} 외 ${rest}명` : shown.join(', ');
}
