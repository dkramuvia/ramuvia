import { StyleSheet, View } from 'react-native';

import { StatusBadge } from './StatusBadge';
import type { MovementStatus } from './statusText';

/**
 * 마커 **아래에 붙는 상태 배지** (피그마 2026-09-28).
 *
 * 캐릭터는 그림 파일로 올리고(`markerAvatars.ts`), 글자인 배지는 뷰 그대로 둡니다 —
 * 지도가 뷰를 구울 때 **글자는 잘 들어가고 그림만 빠지기** 때문입니다.
 * 그래서 사람 한 명에 마커가 둘입니다: 캐릭터 하나, 배지 하나.
 *
 * 위쪽에 빈 자리를 두고 마커를 `anchor={{ x: 0.5, y: 0 }}` 로 붙이면,
 * 그 빈 자리만큼 아래로 내려가 캐릭터 밑에 놓입니다.
 */

/** 캐릭터(44) 의 절반 + 여백. 이만큼 아래로 내려갑니다 */
const 내리기 = 26;

export function BadgeMarker({
  status,
  battery,
  isMe,
}: {
  status: MovementStatus;
  battery?: number | null;
  isMe?: boolean;
}) {
  return (
    <View style={styles.wrap}>
      <StatusBadge text={status.text} kind={status.kind} battery={battery} tone={isMe ? 'mine' : 'friend'} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 내리기, alignItems: 'center' },
});
