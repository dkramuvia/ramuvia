import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui';
import { makeStyles } from '@/theme';
import { StatusBadge } from './StatusBadge';
import type { MovementStatus } from './statusText';

interface AvatarMarkerProps {
  name: string;
  /** 지금은 쓰지 않습니다 — 아래 TODO 참고 (마커 안에는 사진이 안 들어갑니다) */
  imageUrl?: string;
  online?: boolean;
  isMe?: boolean;
  /** 아바타 아래 상태 한 줄 + 이동 수단 그림 (피그마 2026-09-28) */
  status?: MovementStatus | null;
  battery?: number | null;
}

/**
 * 지도 위 사람 마커: 흰 테두리 원형 아바타 (내 마커는 테두리 색으로 구분).
 *
 * 2026-09-28 디자인부터 **상태를 마커 아래에 붙입니다.** 예전에는 화면 아래 고정 칩
 * 하나로 내 상태만 보여 줬는데, 그러면 친구가 어디서 얼마나 머물렀는지는 알 수 없었습니다.
 */
export function AvatarMarker({ name, online, isMe, status, battery }: AvatarMarkerProps) {
  const styles = useStyles();
  return (
    <View style={styles.wrap}>
      <View style={[styles.ring, isMe && styles.ringMe]}>
        {/*
          TODO(지도): 마커 안에 **사진을 넣지 못합니다.** 안드로이드 지도는 마커를 그림
          한 장으로 구워서 올리는데, 사진은 그 그림에 안 들어가고 배경색만 남습니다
          (2026-09-29 폰에서 확인. 계속 그리기·미리 받기·다시 붙이기·자르기 해제를
          모두 해 봤지만 그대로였습니다. 같은 아바타가 프로필 버튼에는 잘 나옵니다).
          검은 동그라미보다는 이름 두 글자가 나으므로 사진을 넘기지 않습니다.
          피그마는 마커에도 캐릭터가 들어가므로, 방법을 더 찾아야 합니다.
        */}
        <Avatar name={name} size={40} online={online} />
      </View>
      {status ? (
        <View style={styles.badge}>
          <StatusBadge text={status.text} kind={status.kind} battery={battery} tone={isMe ? 'mine' : 'friend'} />
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { alignItems: 'center' },
  // 배지가 아바타보다 넓어도 마커 자리가 밀리지 않게 띄워서 올립니다
  badge: { marginTop: 4 },
  ring: {
    padding: 3,
    borderRadius: 30,
    backgroundColor: colors.white,
    elevation: 3,
    shadowColor: colors.black,
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  ringMe: { backgroundColor: colors.primary },
}));
