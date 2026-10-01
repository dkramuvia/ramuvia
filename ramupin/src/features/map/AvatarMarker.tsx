import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui';
import { makeStyles } from '@/theme';
import { useMarkerReady } from './markerReady';
import { StatusBadge } from './StatusBadge';
import type { MovementStatus } from './statusText';

interface AvatarMarkerProps {
  name: string;
  /** 서버가 준 값 그대로 (`avatar:boy-01` 또는 올린 사진 주소) */
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
 *
 * **캐릭터가 마커 안에 들어갑니다.** 안드로이드 지도가 마커를 그림 한 장으로 굽기
 * 때문에, 굽는 시점에 아직 안 불러온 그림은 빠집니다. 그림이 뜨면
 * `useMarkerReady()` 로 알려서 **한 번 더 굽게** 합니다 → `TrackedMarker.tsx`
 */
export function AvatarMarker({ name, imageUrl, online, isMe, status, battery }: AvatarMarkerProps) {
  const styles = useStyles();
  const markerReady = useMarkerReady();

  // 캐릭터가 없는 사람은 이니셜만 나오므로 기다릴 것이 없습니다.
  // 알리지 않으면 마커가 4초 동안 계속 다시 그려집니다
  useEffect(() => {
    if (!imageUrl) markerReady();
  }, [imageUrl, markerReady]);

  return (
    <View style={styles.wrap}>
      <View style={[styles.ring, isMe && styles.ringMe]}>
        <Avatar name={name} imageUrl={imageUrl} size={40} online={online} onImageSettled={markerReady} />
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
