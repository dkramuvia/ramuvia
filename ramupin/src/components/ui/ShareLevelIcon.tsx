import { Image } from 'react-native';

import { colors } from '@/theme';
import type { LocationShareLevel } from '@/types/models';

const ICONS: Record<LocationShareLevel, number> = {
  exact: require('../../../assets/icons/share-exact.png'),
  blurred: require('../../../assets/icons/share-blurred.png'),
  hidden: require('../../../assets/icons/share-hidden.png'),
};

interface ShareLevelIconProps {
  level: LocationShareLevel;
  size?: number;
  color?: string;
}

/** 위치 공유 상태 아이콘 (정확 = 화살표, 흐림 = 흐린 화살표, 비공개 = 사선 화살표) */
export function ShareLevelIcon({ level, size = 16, color = colors.textStrong }: ShareLevelIconProps) {
  return (
    <Image
      source={ICONS[level]}
      style={{ width: size, height: size, tintColor: color }}
      resizeMode="contain"
    />
  );
}
