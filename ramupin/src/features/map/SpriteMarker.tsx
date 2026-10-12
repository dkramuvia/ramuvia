import { memo } from 'react';
import { Marker } from 'react-native-maps';

import { spriteSizeDp, useSpriteFrame } from './spriteClock';
import type { SpriteSheet } from './spriteTypes';
import type { LatLng } from '@/types/models';

/**
 * **움직이는 그림 마커** (안드로이드 구글 지도 전용).
 *
 * 지도는 마커를 그림 한 장으로 구워 올리므로, 뷰 안에 GIF 를 넣어도 움직이지 않고
 * 그림은 아예 빠집니다 (markerAvatars.ts). 대신 **마커 아이콘 그림을 직접 바꿔 끼우면**
 * 지도가 그 그림을 그대로 씁니다 — 캐릭터 마커가 나오는 것과 같은 길입니다.
 *
 * `offset` 은 좌표에서 그림 **가운데**까지의 거리(dp)입니다. 지도의 anchor 는 그림 크기에
 * 대한 비율이라, 그림보다 멀리 떨어뜨리면 0~1 을 벗어납니다 (구글 지도는 그대로 받아 줍니다).
 */
/**
 * **장면 미리 올리기.** 지도는 마커 그림을 처음 받을 때 준비하는 동안 한두 장면을 비워 그려서,
 * 처음 한 바퀴 동안 그림이 깜빡였습니다 (배포용 앱, 10-12 폰 녹화로 확인).
 * 모든 장면을 보이지 않는 마커로 미리 올려 두면 지도가 그림을 한 번만 준비하고 계속 갖고 있습니다.
 */
export const SpriteWarmup = memo(function SpriteWarmup({ coordinate, sheet }: { coordinate: LatLng; sheet: SpriteSheet }) {
  return (
    <>
      {sheet.frames.map((f, i) => (
        <Marker key={i} coordinate={coordinate} image={f} opacity={0} tappable={false} tracksViewChanges={false} zIndex={-1} />
      ))}
    </>
  );
});

export const SpriteMarker = memo(function SpriteMarker({
  coordinate,
  sheet,
  offset,
  zIndex,
  onPress,
}: {
  coordinate: LatLng;
  sheet: SpriteSheet;
  offset: { x: number; y: number };
  zIndex?: number;
  onPress?: () => void;
}) {
  const frame = useSpriteFrame(sheet.frames.length);
  // anchor 는 그림 크기에 대한 비율입니다 (dp 끼리 나눔)
  const size = spriteSizeDp(sheet);
  const anchor = { x: 0.5 - offset.x / size.width, y: 0.5 - offset.y / size.height };
  return (
    <Marker
      coordinate={coordinate}
      anchor={anchor}
      image={sheet.frames[frame]}
      zIndex={zIndex}
      onPress={onPress}
      tracksViewChanges={false}
    />
  );
});
