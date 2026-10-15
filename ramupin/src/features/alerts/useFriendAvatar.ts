import { useFriends } from '@/features/friends/queries';

/**
 * 알림 팝업·카드에 띄울 친구 사진.
 *
 * 서버 실시간 알림(SOS·안심존·과속)에는 닉네임만 오고 사진 주소가 없어, 팝업에 늘 이름 첫 글자만
 * 나왔습니다 (10-15 실서버 시험). 닉네임은 가입 때 중복 확인을 거쳐 겹치지 않으므로 친구 목록에서 찾습니다.
 */
export function useFriendAvatar(name: string | undefined): string | undefined {
  const { data: friends } = useFriends();
  if (!name) return undefined;
  return friends?.find((f) => f.nickname === name)?.avatarUrl;
}
