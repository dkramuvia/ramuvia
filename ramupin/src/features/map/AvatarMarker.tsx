import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui';
import { makeStyles } from '@/theme';
import { StatusBadge } from './StatusBadge';
import type { MovementStatus } from './statusText';

interface AvatarMarkerProps {
  name: string;
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
export function AvatarMarker({ name, imageUrl, online, isMe, status, battery }: AvatarMarkerProps) {
  const styles = useStyles();
  return (
    <View style={styles.wrap}>
      <View style={[styles.ring, isMe && styles.ringMe]}>
        <Avatar name={name} imageUrl={imageUrl} size={40} online={online} />
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
