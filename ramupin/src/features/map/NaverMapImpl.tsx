import { NaverMapCircleOverlay, NaverMapMarkerOverlay, NaverMapPathOverlay, NaverMapView, type NaverMapViewRef } from '@mj-studio/react-native-naver-map';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { PixelRatio, StyleSheet, View } from 'react-native';

import { anchorFor, iconSizeDp, useMarkerPress } from './markerPress';
import { MarkerRenderContext, spriteSizeDp } from './spriteClock';
import { LiveSprite } from './StatusBadge';
import type { SpriteSheet } from './spriteTypes';
import type { MapImplProps, MapImplHandle, MapMarkerItem } from './types';
import type { Preferences } from '@/stores/preferencesStore';
import type { LatLng } from '@/types/models';

/** 앱 설정의 지도 유형 → 네이버 지도 타입 */
const MAP_TYPES: Record<Preferences['mapType'], 'Basic' | 'Satellite' | 'Terrain'> = {
  road: 'Basic',
  satellite: 'Satellite',
  terrain: 'Terrain',
};

/** 위도 범위(delta) → 줌 레벨. delta 가 작을수록 확대 */
const zoomOf = (delta: number) => Math.min(21, Math.max(4, Math.log2(360 / delta) - 1));

type Size = { width: number; height: number };

/**
 * 네이버 지도 (유료 등급 전용, WBS 4.4·10.5).
 * 화면은 AppMapView 만 사용하고, 네이버 SDK 는 이 파일에서만 다룹니다.
 *
 * **마커는 구글 지도와 똑같이 그립니다** (2026-10-07, 피그마는 지도 종류별 마커가 따로 없음).
 * 캐릭터 핀은 그림 파일, 이름 핀·배지는 뷰입니다. 커스텀 뷰는 **넘겨준 크기대로** 구워지므로
 * 그려진 크기를 재서 넘깁니다. 구글과 다른 점: 띄우기는 여백으로, 움직이는 그림은 뷰 안에서 (아래 설명).
 */
export const NaverMapImpl = forwardRef<MapImplHandle, MapImplProps>(function NaverMapImpl(
  { initialCenter, markers = [], circles = [], polylines = [], padding, onPress, interactive = true, onCenterChange, initialDelta, mapType, nightMode, style },
  ref,
) {
  const mapRef = useRef<NaverMapViewRef>(null);
  /**
   * 네이버는 지도 위 손가락이 RN 뷰로 오지 않습니다 (onTouchStart 가 불리지 않음, 10-07 폰에서 확인).
   * 대신 지도 탭 이벤트에 **탭한 자리(x, y, 픽셀)**가 들어 있어 그것으로 판정합니다.
   * 마커를 눌러도 지도 탭이 오도록 라이브러리를 고쳤습니다 (patches/@mj-studio+react-native-naver-map) —
   * 원래는 마커가 탭을 먹어서 지도 탭이 오지 않고, 마커 탭에는 자리가 없었습니다.
   */
  const press = useMarkerPress({
    project: async (c) => {
      const r = await mapRef.current?.coordinateToScreen(c);
      return r?.isValid ? { x: r.screenX, y: r.screenY } : null;
    },
    markers,
    onMapPress: onPress,
  });

  useImperativeHandle(ref, () => ({
    moveTo: (coordinate, zoomDelta) => mapRef.current?.animateCameraTo({ ...coordinate, zoom: zoomOf(zoomDelta ?? initialDelta), duration: 400 }),
    fitTo: (coordinates) => {
      if (coordinates.length === 0) return;
      const lats = coordinates.map((c) => c.latitude);
      const lngs = coordinates.map((c) => c.longitude);
      mapRef.current?.animateRegionTo({
        latitude: Math.min(...lats),
        longitude: Math.min(...lngs),
        latitudeDelta: Math.max(0.002, Math.max(...lats) - Math.min(...lats)),
        longitudeDelta: Math.max(0.002, Math.max(...lngs) - Math.min(...lngs)),
        duration: 400,
      });
    },
  }));

  return (
    // 손가락이 닿은 자리를 받아 둡니다. 누가 눌렸는지는 useMarkerPress 가 판정합니다
    <View ref={press.frameRef} style={style ?? StyleSheet.absoluteFill} onTouchStart={press.onTouchStart} onLayout={press.onFrameLayout}>
      <NaverMapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialCamera={{ ...initialCenter, zoom: zoomOf(initialDelta) }}
        mapType={MAP_TYPES[mapType]}
        // 바텀시트·광고 등에 가려지는 만큼 지도 안쪽 여백
        mapPadding={padding}
        isNightModeEnabled={nightMode}
        isShowScaleBar={false}
        isShowZoomControls={false}
        isShowLocationButton={false}
        isScrollGesturesEnabled={interactive}
        isZoomGesturesEnabled={interactive}
        isRotateGesturesEnabled={interactive}
        isTiltGesturesEnabled={interactive}
        // 탭 위치는 픽셀로 옵니다 (좌표 변환 coordinateToScreen 은 dp). dp 로 맞춥니다
        onTapMap={(e) => press.resolveAt({ x: e.x / PixelRatio.get(), y: e.y / PixelRatio.get() })}
        onCameraChanged={onCenterChange ? (e) => onCenterChange({ latitude: e.latitude, longitude: e.longitude }) : undefined}
      >
        {circles.map((c) => (
          <NaverMapCircleOverlay
            key={c.id}
            latitude={c.center.latitude}
            longitude={c.center.longitude}
            radius={c.radiusM}
            color={c.fillColor}
            outlineColor={c.strokeColor}
            outlineWidth={1}
          />
        ))}
        {polylines.map((p) => (
          <NaverMapPathOverlay key={p.id} coords={p.coordinates} width={p.width ?? 6} color={p.color} outlineWidth={0} />
        ))}
        {/*
          네이버는 커스텀 뷰를 넘겨준 크기대로 **계속 다시 그려 줍니다** (ViewChangesTracker).
          그래서 움직이는 그림을 배지 안에서 바로 돌립니다 (구글처럼 그림 마커를 따로 겹치지 않음).
        */}
        <MarkerRenderContext.Provider value="live">
          {markers.map((m) => {
            // 위아래 순서가 바뀌면 새로 만듭니다 (구글과 같게 — 겹친 마커 순서를 확실히 맞추려고)
            const key = `${m.id}@${m.zIndex ?? 0}`;
            if (m.sprite) return <NaverSprite key={key} coordinate={m.coordinate} sheet={m.sprite.sheet} offset={m.sprite.offset} zIndex={m.zIndex} />;
            return <NaverItem key={key} item={m} onSize={(size) => press.setSize(m.id, size)} />;
          })}
        </MarkerRenderContext.Provider>
      </NaverMapView>
    </View>
  );
});

/**
 * 마커 하나. 그림 파일이면 그대로, 뷰면 그려진 크기를 재서 그 크기로 굽게 합니다.
 * 마커 자체 누름은 쓰지 않고 지도 판정(useMarkerPress)으로 보냅니다 — 겹친 아래 사람을 누를 수 있게.
 *
 * **띄우기(lift)는 아래 여백으로 줍니다.** 네이버는 0~1 을 넘는 anchor 를 1 로 잘라서, 구글처럼
 * anchor 로 띄우면 배지가 핀에 겹쳤습니다 (2026-10-07 폰에서 확인). 네이버는 뷰를 넘겨준 크기대로
 * 다시 그려 주므로 여백이 빠지는 일이 없습니다.
 */
function NaverItem({ item, onSize }: { item: MapMarkerItem; onSize?: (size: Size) => void }) {
  const [box, setBox] = useState<Size | null>(null);
  const common = {
    latitude: item.coordinate.latitude,
    longitude: item.coordinate.longitude,
    zIndex: item.zIndex,
    isHideCollidedSymbols: false,
    isHideCollidedMarkers: false,
    isHideCollidedCaptions: false,
  };

  if (item.iconImage) {
    const size = iconSizeDp(item.iconImage);
    return <NaverMapMarkerOverlay {...common} image={item.iconImage as number} width={size?.width} height={size?.height} anchor={anchorFor(item, size)} />;
  }

  const lift = item.lift ?? 0;
  return (
    <NaverMapMarkerOverlay
      {...common}
      width={box?.width ?? 1}
      height={box?.height ?? 1}
      anchor={item.lift != null ? { x: item.anchor?.x ?? 0.5, y: 1 } : (item.anchor ?? { x: 0.5, y: 0.5 })}
    >
      {/* 위치를 고정해 두면 내용 크기만큼만 잡힙니다 (마커 크기에 늘어나지 않게). 이 크기로 굽습니다 */}
      <View
        collapsable={false}
        style={[styles.measure, lift ? { paddingBottom: lift } : null]}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          if (box?.width === width && box?.height === height) return;
          setBox({ width, height });
        }}
      >
        {/* 누름 판정용 크기는 여백을 뺀 내용만 (useMarkerPress 가 lift 를 따로 더합니다) */}
        <View collapsable={false} onLayout={(e) => onSize?.({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
          {item.children}
        </View>
      </View>
    </NaverMapMarkerOverlay>
  );
}

/**
 * 움직이는 그림 마커(발자국). 네이버는 anchor 를 0~1 로 잘라서, 그림을 offset 만큼 옮긴 자리에
 * 놓을 수 있게 **좌표를 가운데로 하는 투명한 판** 위에 그립니다. 판은 계속 다시 그려집니다.
 */
function NaverSprite({ coordinate, sheet, offset, zIndex }: { coordinate: LatLng; sheet: SpriteSheet; offset: { x: number; y: number }; zIndex?: number }) {
  const size = spriteSizeDp(sheet);
  const width = 2 * (Math.abs(offset.x) + size.width / 2);
  const height = 2 * (Math.abs(offset.y) + size.height / 2);
  return (
    <NaverMapMarkerOverlay
      latitude={coordinate.latitude}
      longitude={coordinate.longitude}
      width={width}
      height={height}
      anchor={{ x: 0.5, y: 0.5 }}
      zIndex={zIndex}
      isHideCollidedSymbols={false}
      isHideCollidedMarkers={false}
    >
      <View collapsable={false} style={{ width, height }}>
        <View style={{ position: 'absolute', left: width / 2 + offset.x - size.width / 2, top: height / 2 + offset.y - size.height / 2 }}>
          <LiveSprite sheet={sheet} />
        </View>
      </View>
    </NaverMapMarkerOverlay>
  );
}

const styles = StyleSheet.create({
  measure: { position: 'absolute', left: 0, top: 0 },
});
