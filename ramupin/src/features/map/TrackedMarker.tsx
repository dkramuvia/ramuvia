import { useCallback, useEffect, useRef, useState } from 'react';
import { Marker } from 'react-native-maps';

import type { MapMarkerItem } from './types';
import { MarkerReadyProvider } from './markerReady';

/**
 * 마커 안의 **그림이 다 뜬 뒤에 한 번 더 그리게** 하는 마커.
 *
 * 안드로이드 지도는 마커를 **그림 한 장으로 구워서** 올립니다. 구울 때 아직
 * 안 불러온 이미지는 **그냥 빠집니다** — 그래서 캐릭터 자리에 배경색만 남았습니다
 * (2026-09-29 폰에서 확인).
 *
 * 해결은 두 단계입니다.
 *   1. 처음에는 `tracksViewChanges` 를 켜 둬서 계속 다시 굽게 합니다
 *   2. 안쪽 그림이 `onLoad` 를 알려 오면, 한 박자 뒤에 **끕니다**
 *
 * **왜 끄는가**: 켜 둔 채로 두면 지도가 매 프레임 마커를 다시 굽습니다.
 * 친구가 여럿이면 지도가 눈에 띄게 버벅이고 배터리를 먹습니다.
 *
 * 내용이 바뀌면(머문 시간 문구·배터리) 다시 켜야 하므로 `trackKey` 를 봅니다.
 */

/** 그림이 안 와도 이만큼 지나면 포기하고 끕니다 (영원히 켜 두지 않게) */
const GIVE_UP_MS = 4000;
/** `onLoad` 뒤 실제로 꺼지기까지. 마지막 한 번을 확실히 굽기 위한 여유입니다 */
const SETTLE_MS = 600;

export function TrackedMarker({ item }: { item: MapMarkerItem }) {
  const [tracks, setTracks] = useState(true);
  // 그림이 캐시에 들어온 뒤 **마커를 다시 만들기** 위한 값입니다 (아래 설명)
  const [gen, setGen] = useState(0);
  const remade = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopSoon = useCallback((delay: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setTracks(false), delay);
  }, []);

  // 내용이 바뀌면 다시 켭니다 (머문 시간 문구가 1분마다 바뀝니다)
  useEffect(() => {
    setTracks(true);
    remade.current = false;
    stopSoon(GIVE_UP_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [item.trackKey, stopSoon]);

  const onContentReady = useCallback(() => {
    stopSoon(SETTLE_MS);
    // **마커를 한 번 다시 만듭니다.**
    // 다시 굽게 하는 것만으로는 그림이 안 들어갔습니다 (2026-10-01 폰에서 확인).
    // 그림이 캐시에 들어온 뒤 마커를 새로 만들면, 만들 때 바로 그려집니다.
    // `remade` 로 한 번만 합니다 — 안 그러면 새로 만들 때마다 또 불려 끝없이 돕니다
    if (remade.current) return;
    remade.current = true;
    setTimeout(() => setGen((g) => g + 1), 100);
  }, [stopSoon]);

  // 그림 아이콘이 있으면 뷰를 굽지 않습니다 (가장 확실하게 보이는 길)
  if (item.iconImage) {
    return (
      <Marker
        coordinate={item.coordinate}
        anchor={item.anchor ?? { x: 0.5, y: 0.5 }}
        onPress={item.onPress}
        zIndex={item.zIndex}
        image={item.iconImage}
      />
    );
  }

  return (
    <Marker
      key={gen}
      coordinate={item.coordinate}
      anchor={item.anchor ?? { x: 0.5, y: 0.5 }}
      onPress={item.onPress}
      zIndex={item.zIndex}
      tracksViewChanges={tracks}
    >
      <MarkerReadyProvider onReady={onContentReady}>{item.children}</MarkerReadyProvider>
    </Marker>
  );
}
