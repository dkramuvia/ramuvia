import { Image, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
// 아바타 키(`avatar:boy-01`)를 그림으로 바꿉니다. **여기서 바꿔야 합니다** —
// 부르는 쪽 28군데 중 27군데가 이 단계를 빠뜨려 캐릭터가 안 보였습니다 (2026-09-29)
import { avatarSource } from '@/features/settings/avatars';
import { makeStyles, useColors } from '@/theme';

interface AvatarProps {
  name: string;
  /**
   * 서버가 준 값 그대로 주세요.
   * 캐릭터 키(`avatar:girl-01`)든 올린 사진 주소든 여기서 알아서 처리합니다.
   */
  imageUrl?: string;
  size?: number;
  /** 접속 중이면 오른쪽 아래 초록 점 */
  online?: boolean;
  /**
   * 그림이 다 떴을 때(또는 실패했을 때) 부릅니다.
   * 지도 마커가 이걸 보고 **다시 한 번 굽습니다** → `features/map/TrackedMarker.tsx`
   */
  onImageSettled?: () => void;
}

/** 이름에서 두 글자 이니셜을 만듭니다. 영문은 대문자, 한글은 앞 두 글자. */
function initials(name: string) {
  const trimmed = name.trim();
  if (/^[a-zA-Z]/.test(trimmed)) return trimmed.slice(0, 2).toUpperCase();
  return trimmed.slice(0, 2);
}

/** 피그마 "Avatar Placeholder" / "Avatar With Status Badge" */
export function Avatar({ name, imageUrl, size = 40, online, onImageSettled }: AvatarProps) {
  const styles = useStyles();
  const colors = useColors();
  const badge = Math.round(size / 4);
  const source = avatarSource(imageUrl);
  return (
    <View style={{ width: size, height: size }}>
      <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
        {source ? (
          <Image
            source={source}
            // 부모에서 잘라내지 않고 **그림 자체를 둥글게** 합니다.
            // 안드로이드 지도는 마커를 소프트웨어 캔버스에 굽는데, 둥글게 잘라낸
            // 자식은 그때 통째로 빠집니다 — 그래서 배경색만 남았습니다 (2026-10-01)
            style={{ width: size, height: size, borderRadius: size / 2 }}
            // **지도 마커에 꼭 필요합니다.** 안드로이드 Image 는 기본으로 300ms 동안
            // 서서히 나타나는데, 지도는 그 전에 마커를 그림으로 구워 버립니다.
            // 그래서 투명한 상태가 찍혀 배경색(검정)만 남았습니다 (2026-10-01 확인)
            fadeDuration={0}
            // 실패해도 알립니다. 안 알리면 마커가 계속 다시 그려져 지도가 버벅입니다
            onLoad={onImageSettled}
            onError={onImageSettled}
          />
        ) : (
          <AppText variant="label1" color={colors.avatarText} style={{ fontSize: size * 0.35 }}>
            {initials(name)}
          </AppText>
        )}
      </View>
      {online ? (
        <View style={[styles.badge, { width: badge + 2, height: badge + 2, borderRadius: badge }]} />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  circle: {
    backgroundColor: colors.avatarBackground,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    backgroundColor: colors.online,
    borderWidth: 1,
    borderColor: colors.white,
  },
}));
