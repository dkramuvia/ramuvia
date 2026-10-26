import type { GroupDetail, SafetySetting } from '@/types/models';

/**
 * SOS 수신 인원 (보완 4.4 업무 규칙).
 *
 * 인원 = 지정한 친구 + 지정한 그룹들의 멤버(나 제외) + 비회원 연락처. 친구와 그룹에 겹치는 사람은 1명으로 셉니다.
 * 서버도 같은 순서(친구·그룹 먼저, 남는 자리만큼 문자)로 한도를 적용합니다 (sos.service.ts).
 */
export function countSosRecipients(
  setting: Pick<SafetySetting, 'recipientFriendIds' | 'recipientGroupIds' | 'contacts'>,
  groups: Pick<GroupDetail, 'id' | 'members'>[],
  myId: string | undefined,
): number {
  const people = new Set(setting.recipientFriendIds);
  for (const group of groups) {
    if (!setting.recipientGroupIds.includes(group.id)) continue;
    for (const member of group.members) if (member.id !== myId) people.add(member.id);
  }
  return people.size + setting.contacts.length;
}
