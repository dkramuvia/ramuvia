import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui';
import { colors } from '@/theme';

interface AvatarMarkerProps {
  name: string;
  imageUrl?: string;
  online?: boolean;
  isMe?: boolean;
}

/** 지도 위 사람 마커: 흰 테두리 원형 아바타 (내 마커는 테두리 색으로 구분) */
export function AvatarMarker({ name, imageUrl, online, isMe }: AvatarMarkerProps) {
  return (
    <View style={[styles.ring, isMe && styles.ringMe]}>
      <Avatar name={name} imageUrl={imageUrl} size={40} online={online} />
    </View>
  );
}

const styles = StyleSheet.create({
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
});
