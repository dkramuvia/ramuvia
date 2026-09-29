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
}

/** 이름에서 두 글자 이니셜을 만듭니다. 영문은 대문자, 한글은 앞 두 글자. */
function initials(name: string) {
  const trimmed = name.trim();
  if (/^[a-zA-Z]/.test(trimmed)) return trimmed.slice(0, 2).toUpperCase();
  return trimmed.slice(0, 2);
}

/** 피그마 "Avatar Placeholder" / "Avatar With Status Badge" */
export function Avatar({ name, imageUrl, size = 40, online }: AvatarProps) {
  const styles = useStyles();
  const colors = useColors();
  const badge = Math.round(size / 4);
  const source = avatarSource(imageUrl);
  return (
    <View style={{ width: size, height: size }}>
      <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
        {source ? (
          <Image source={source} style={{ width: size, height: size }} />
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
    overflow: 'hidden',
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
