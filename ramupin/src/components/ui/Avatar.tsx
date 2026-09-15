import { Image, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { colors } from '@/theme';

interface AvatarProps {
  name: string;
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
  const badge = Math.round(size / 4);
  return (
    <View style={{ width: size, height: size }}>
      <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={{ width: size, height: size }} />
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

const styles = StyleSheet.create({
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
});
