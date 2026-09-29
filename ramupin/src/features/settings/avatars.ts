import type { ImageSourcePropType } from 'react-native';

import type { Gender } from '@/types/models';

/**
 * 피그마 [설정] 페이지 Boys/Girls 캐릭터 아바타 (프로필 편집에서 좌우로 넘겨 선택).
 * 서버에는 "avatar:boy-01" 같은 키만 저장하고, 기기에서 이미지로 바꿉니다.
 */
const BOYS = [
  require('../../../assets/avatars/boy-01.jpg'),
  require('../../../assets/avatars/boy-02.jpg'),
  require('../../../assets/avatars/boy-03.jpg'),
  require('../../../assets/avatars/boy-04.jpg'),
  require('../../../assets/avatars/boy-05.jpg'),
  require('../../../assets/avatars/boy-06.jpg'),
  require('../../../assets/avatars/boy-07.jpg'),
  require('../../../assets/avatars/boy-08.jpg'),
  require('../../../assets/avatars/boy-09.jpg'),
  require('../../../assets/avatars/boy-10.jpg'),
  require('../../../assets/avatars/boy-11.jpg'),
  require('../../../assets/avatars/boy-12.jpg'),
  require('../../../assets/avatars/boy-13.jpg'),
  require('../../../assets/avatars/boy-14.jpg'),
  require('../../../assets/avatars/boy-15.jpg'),
  require('../../../assets/avatars/boy-16.jpg'),
  require('../../../assets/avatars/boy-17.jpg'),
  require('../../../assets/avatars/boy-18.jpg'),
];

const GIRLS = [
  require('../../../assets/avatars/girl-01.jpg'),
  require('../../../assets/avatars/girl-02.jpg'),
  require('../../../assets/avatars/girl-03.jpg'),
  require('../../../assets/avatars/girl-04.jpg'),
  require('../../../assets/avatars/girl-05.jpg'),
  require('../../../assets/avatars/girl-06.jpg'),
  require('../../../assets/avatars/girl-07.jpg'),
  require('../../../assets/avatars/girl-08.jpg'),
  require('../../../assets/avatars/girl-09.jpg'),
  require('../../../assets/avatars/girl-10.jpg'),
  require('../../../assets/avatars/girl-11.jpg'),
  require('../../../assets/avatars/girl-12.jpg'),
  require('../../../assets/avatars/girl-13.jpg'),
  require('../../../assets/avatars/girl-14.jpg'),
  require('../../../assets/avatars/girl-15.jpg'),
  require('../../../assets/avatars/girl-16.jpg'),
  require('../../../assets/avatars/girl-17.jpg'),
  require('../../../assets/avatars/girl-18.jpg'),
  require('../../../assets/avatars/girl-19.jpg'),
  require('../../../assets/avatars/girl-20.jpg'),
];

const PREFIX = 'avatar:';

export function characterAvatars(gender: Gender) {
  const list = gender === 'female' ? GIRLS : BOYS;
  const tag = gender === 'female' ? 'girl' : 'boy';
  return list.map((source, i) => ({ key: `${PREFIX}${tag}-${String(i + 1).padStart(2, '0')}`, source }));
}

/**
 * 서버가 준 `avatarUrl` 을 `<Image>` 에 넣을 수 있는 값으로 바꿉니다.
 *   - 캐릭터 키(`avatar:girl-01`) → **앱에 들어 있는 그림 그대로**
 *   - 올린 사진 주소 → `{ uri }`
 *   - 없거나 모르는 값 → `undefined` (아바타는 이름 두 글자를 보여 줍니다)
 *
 * 앱에 들어 있는 그림을 굳이 주소 문자열로 바꾸지 않습니다. 그러면 개발 중에는
 * Metro 서버에서 받아 오게 되어 느리고, 지도 마커처럼 **기다려 주지 않는 곳**에서는
 * 빈 자리로 남습니다.
 */
export function avatarSource(avatarUrl?: string): ImageSourcePropType | undefined {
  if (!avatarUrl) return undefined;
  if (!avatarUrl.startsWith(PREFIX)) return { uri: avatarUrl };
  const [tag, num] = avatarUrl.slice(PREFIX.length).split('-');
  const list = tag === 'girl' ? GIRLS : BOYS;
  return (list[Number(num) - 1] as ImageSourcePropType | undefined) ?? undefined;
}
