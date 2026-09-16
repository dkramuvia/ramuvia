import type { FoundUser } from '@/types/models';

/** ID·QR 로 찾은 사람에게 친구 요청을 보낼 수 없는 이유 (i18n 키). 보낼 수 있으면 null */
export function blockedRequestReason(user: FoundUser): string | null {
  switch (user.relation) {
    case 'self':
      return 'friendAdd.isMyself';
    case 'friend':
      return 'friendAdd.alreadyFriend';
    case 'request_sent':
      return 'friendAdd.alreadyRequested';
    default:
      return null;
  }
}
