import { useEffect } from 'react';
import { AppState } from 'react-native';

import { unwatchFriends, watchFriends } from '@/features/chat/realtime';

/**
 * "지금 이 친구들 지도를 보고 있다"를 서버에 알립니다 (GPS 보고서 2-1 6번, 4-3).
 *
 * 서버는 이 신호를 받은 친구들 폰에만 촘촘한 수집(5초)을 켜라고 알리고,
 * 화면을 닫거나 앱을 내리면 바로 되돌립니다. 아무도 안 볼 때 촘촘히 보내면
 * 배터리와 서버 비용을 그냥 버리는 셈이기 때문입니다.
 */
export function useWatchFriends(friendIds: string[]) {
  // 배열은 매번 새로 만들어지므로 내용으로 비교합니다 (같은 목록에 계속 다시 보내지 않게)
  const key = friendIds.join(',');

  useEffect(() => {
    if (!key) return;
    const ids = key.split(',');
    watchFriends(ids);

    // 앱을 내리면 지도를 보고 있는 게 아니므로 꺼 줍니다
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') watchFriends(ids);
      else unwatchFriends();
    });

    return () => {
      sub.remove();
      unwatchFriends();
    };
  }, [key]);
}
