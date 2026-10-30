import { Ionicons } from '@expo/vector-icons';
import * as Battery from 'expo-battery';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dimensions, Linking, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Avatar, SheetScrollView, SnapSheet, type SnapSheetHandle } from '@/components/ui';
import { FriendRow } from '@/features/friends/FriendRow';
import { useFriendRequests, useFriends } from '@/features/friends/queries';
import { gpsSignal, type GpsSignal } from '@/features/location/signal';
import { getActivity } from '../../../modules/ramupin-gps';
import { stayedSince } from '@/features/location/backgroundTask';
import { useAreaName } from '@/features/location/useAreaName';
import { useLocationUpload } from '@/features/location/useLocationUpload';
import { useMyLocation } from '@/features/location/useMyLocation';
import { AppMapView, useMapProvider, type AppMapViewHandle, type MapCircleItem, type MapMarkerItem } from '@/features/map/AppMapView';
import { BADGE_BOTTOM_GAP, BadgeMarker, badgeAnchor } from '@/features/map/BadgeMarker';
import { centerOf, clusterByDistance, overlapDistanceM, spreadM } from '@/features/map/cluster';
import { StreetViewWeb } from '@/features/map/StreetViewWeb';
import { personPin } from '@/features/map/PinMarker';
import { badgeSprite } from '@/features/map/spriteClock';
import { SPRITES } from '@/features/map/sprites';
import { statusText } from '@/features/map/statusText';
import { TrackingPrompt } from '@/features/location/TrackingPrompt';
import { WeatherBadge } from '@/features/weather/WeatherBadge';
import { useWeather } from '@/features/weather/useWeather';
import { PLAN_NAMES } from '@/features/policy/policies';
import { usePlan } from '@/features/policy/usePlan';
import { useAuthStore } from '@/stores/authStore';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { layout, makeMapStyles, makeStyles, radius, useColors, useMapIsDark, useMapOverlay, useThemeName, type Palette } from '@/theme';
import type { Friend, LatLng } from '@/types/models';
import { showToast } from '@/utils/toast';
import { useWatchFriends } from '@/features/location/useWatchFriends';
import { useHideMode, useSaveHideMode } from '@/features/settings/queries';

// 위치를 받기 전 첫 화면 중심 (강남역)
const FALLBACK_CENTER: LatLng = { latitude: 37.4979, longitude: 127.0276 };

const SHEET_HEIGHT = 370;
// 내렸을 때 손잡이와 "친구 (N)" 줄만 보이는 높이
const SHEET_COLLAPSED = 78;
/** 지역명·날씨 줄이 차지하는 높이 (안전 영역 아래). 내 마커가 그 뒤에 숨지 않게 지도 위쪽 여백으로 씁니다 */
const TOP_ROW_HEIGHT = 100;
/** 시트 윗변과 내 마커 사이 여유 (마커·배지 높이) */
const SHEET_GAP = 40;
/** 처음 확대 정도 (AppMapView 기본값과 같음). 지도가 범위를 알려 주기 전까지 묶음 계산에 씁니다 */
const INITIAL_DELTA = 0.012;
/** 묶음을 눌렀을 때 사람들이 이보다 떨어져 있으면 확대해서 펼치고, 더 가까우면 목록으로 고르게 합니다 */
const SPREAD_TO_ZOOM_M = 15;

const signalColors = (colors: Palette): Record<GpsSignal, { fill: string; stroke: string; icon: string }> => ({
  good: { fill: 'rgba(0,149,255,0.12)', stroke: 'rgba(0,149,255,0.5)', icon: colors.battery },
  fair: { fill: 'rgba(253,184,18,0.15)', stroke: 'rgba(253,184,18,0.6)', icon: '#FDB812' },
  poor: { fill: 'rgba(255,30,0,0.10)', stroke: 'rgba(255,30,0,0.45)', icon: colors.danger },
});

/** 피그마: 지도 메인 (283:17631 알림 / 283:18094 친구 리스트 / 283:17676 이동 중) */
export default function MapScreen() {
  const styles = useStyles();
  const colors = useColors();
  // 지도 위에 얹는 것들은 앱 화면 색이 아니라 지도 밝기를 따라갑니다.
  // 앱만 다크로 두면 밝은 지도 위에 흰 글자가 되어 지역명·날씨·버튼이 사라집니다
  const overlayStyles = useOverlayStyles();
  const overlay = useMapOverlay();
  // 화면 대부분이 지도라, 맨 위 시계·배터리 색도 앱 화면 색이 아니라 지도 밝기를 따라갑니다
  const mapIsDark = useMapIsDark();
  const appIsDark = useThemeName() === 'dark';
  const showTraffic = usePreferencesStore((s) => s.showTraffic);
  const fitAllFriends = usePreferencesStore((s) => s.fitAllFriends);
  const focused = useIsFocused();
  const { t } = useTranslation();
  const me = useAuthStore((s) => s.user);
  const mapRef = useRef<AppMapViewHandle>(null);
  const insets = useSafeAreaInsets();
  // 시트를 올렸는지 (0 = 접힘). 지도 아래 여백을 시트 높이에 맞춥니다 — 내 마커가 시트 뒤에 숨었습니다 (대표 리포트 79)
  const [sheetIndex, setSheetIndex] = useState(0);
  // 탭을 떠나면 시트를 다시 그리므로(아래 focused) 접힌 상태로 맞춥니다
  useEffect(() => {
    if (!focused) setSheetIndex(0);
  }, [focused]);
  /**
   * 지도에서 **활성화된 사람** (처음엔 나). 누르면 그 사람이 파란 테두리로 바뀌고 맨 위로 올라옵니다 —
   * 핀·배지가 겹쳐 있을 때 아래 사람을 눌러 꺼내 볼 수 있게. 활성화된 친구를 한 번 더 누르면 동선 화면으로 갑니다.
   */
  const [activeId, setActiveId] = useState<string>('me');
  /**
   * 내 위치 따라가기 (대표 리포트 1). 켜져 있으면 내가 움직일 때 지도가 따라옵니다 (확대 정도는 그대로).
   * 손으로 지도를 움직이거나 친구를 활성화하면 꺼지고, 나의 위치 버튼으로 다시 켭니다
   */
  const [following, setFollowing] = useState(true);
  const sheetRef = useRef<SnapSheetHandle>(null);
  // 화면에 보이는 위도 범위. 겹친 친구를 묶는 데 씁니다 (대표 리포트 78)
  const [visibleDelta, setVisibleDelta] = useState(INITIAL_DELTA);
  // 거의 같은 자리라 확대해도 안 갈라지는 묶음을 눌렀을 때 고를 사람들
  const [clusterPick, setClusterPick] = useState<Friend[] | null>(null);

  const { permission, location } = useMyLocation();
  const { can, minPlanFor } = usePlan();
  useLocationUpload(location);
  // 기기 배터리 (-1 = 알 수 없음 → 프로필 값 사용)
  const deviceBattery = Battery.useBatteryLevel();
  const myBattery = deviceBattery >= 0 ? Math.round(deviceBattery * 100) : me?.batteryLevel;
  const areaName = useAreaName(location);
  // 지역명 아래 현재 날씨 (피그마 2026-09-28). 못 가져오면 그리지 않습니다
  const { data: weather } = useWeather(location);
  const { data: friends = [] } = useFriends();
  // 지도를 보고 있는 동안만 친구들 폰이 촘촘하게 위치를 보냅니다 (GPS 보고서 2-1 6번)
  useWatchFriends(useMemo(() => friends.map((f) => f.id), [friends]));
  const { data: requests } = useFriendRequests();
  const hasNewRequests = (requests?.received.length ?? 0) > 0;
  // 숨기기 모드가 켜져 있으면 지도 위에 띠로 알립니다 (대표 리포트 90)
  const { data: hideMode } = useHideMode();
  const saveHideMode = useSaveHideMode();
  const hiding = !!hideMode?.hideAll && (!hideMode.until || new Date(hideMode.until).getTime() > Date.now());

  // 지도를 보는 동안 화면이 꺼지지 않게 합니다 (대표 리포트 2). 다른 탭으로 가면 풉니다
  useEffect(() => {
    if (!focused) return;
    activateKeepAwakeAsync('map').catch(() => undefined);
    return () => {
      void deactivateKeepAwake('map').catch(() => undefined);
    };
  }, [focused]);

  // 첫 위치를 받으면 한 번 내 위치로 이동하고 (initialCenter 는 처음 그릴 때만 적용됨),
  // 그 뒤로는 따라가기가 켜져 있는 동안 가운데만 옮깁니다
  const centeredOnce = useRef(false);
  useEffect(() => {
    if (!location) return;
    if (!centeredOnce.current) {
      centeredOnce.current = true;
      mapRef.current?.moveTo(location);
      return;
    }
    if (following && activeId === 'me') mapRef.current?.panTo(location);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location?.latitude, location?.longitude]);

  // 친구를 활성화하면 그 친구를 보는 중이라 따라가기를 멈춥니다
  useEffect(() => {
    if (activeId !== 'me') setFollowing(false);
  }, [activeId]);

  // 설정 > 지도 "모든 친구 보이게 축소": 친구 위치가 오면 한 번, 나와 친구들이 다 들어오게 맞춥니다
  const fittedOnce = useRef(false);
  useEffect(() => {
    if (!fitAllFriends || fittedOnce.current || !location) return;
    const others = friends.flatMap((f) => (f.location ? [{ latitude: f.location.latitude, longitude: f.location.longitude }] : []));
    if (others.length === 0) return;
    fittedOnce.current = true;
    // 다 보이게 맞춘 화면을 따라가기가 곧바로 내 위치로 되돌리지 않게 합니다
    setFollowing(false);
    mapRef.current?.fitTo([location, ...others]);
  }, [fitAllFriends, friends, location]);

  const signal = gpsSignal(location?.accuracy ?? null);
  // 거리뷰(로드뷰)는 네이버에만 있습니다. 구글·Mapbox 지도일 때는 버튼을 숨깁니다 (대표님 10-12)
  const streetView = useMapProvider(location ?? FALLBACK_CENTER) === 'naver';
  // 로드뷰는 활성화된 사람 자리에서 엽니다. 친구를 눌러 두었으면 그 친구 위치 (대표 리포트 5)
  const activeFriend = activeId === 'me' ? undefined : friends.find((f) => f.id === activeId);

  /**
   * 친구를 지도에서 보여 줍니다 (10-30 대표님 확정: 친구를 누르면 지도에 그 친구 위치,
   * 네이버 지도면 그 자리 로드뷰). 시트는 접어 지도가 보이게 합니다
   */
  const focusFriend = (friend: Friend) => {
    setClusterPick(null);
    if (!friend.location) {
      showToast(t('map.noFriendLocation', { name: friend.nickname }));
      return;
    }
    setActiveId(friend.id);
    mapRef.current?.moveTo(friend.location, 0.006);
    sheetRef.current?.snapToIndex(0);
  };

  // People 탭에서 친구를 누르면 /map?focus=친구id 로 옵니다
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  useEffect(() => {
    if (!focus) return;
    const friend = friends.find((f) => f.id === focus);
    // 친구 목록을 아직 못 받았으면 받은 뒤에 다시 봅니다
    if (!friend) return;
    router.setParams({ focus: undefined });
    focusFriend(friend);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, friends]);

  // 로드뷰 미리보기는 친구를 고른 순간의 자리로 엽니다. 친구가 움직일 때마다 다시 불러오지 않게
  const previewAt = useMemo(
    () => (activeFriend?.location ? { latitude: activeFriend.location.latitude, longitude: activeFriend.location.longitude } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeId, !!activeFriend?.location],
  );
  const streetViewTarget = activeFriend?.location
    ? { latitude: activeFriend.location.latitude, longitude: activeFriend.location.longitude, name: activeFriend.nickname }
    : location
      ? { latitude: location.latitude, longitude: location.longitude, name: areaName ?? '' }
      : null;

  // 내가 지금 자리에 언제부터 있었는지. 수집이 기기에 적어 둔 값이라 서버를 거치지 않습니다
  const [myStayedSince, setMyStayedSince] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const read = () => void stayedSince().then((v) => alive && setMyStayedSince(v));
    read();
    // 머문 시간은 분 단위로 보여 주므로 1분마다 다시 읽으면 충분합니다
    const timer = setInterval(read, 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  // 내 상태는 활동 인식을 먼저 봅니다. 실내에서는 속도가 튀어 "이동중" 이 잘못 뜹니다
  const status = statusText({ activity: getActivity()?.type, speedKmh: location?.speedKmh, stayedSince: myStayedSince });
  /**
   * 내용이 같으면 **같은 객체**로 유지합니다.
   *
   * 마커 목록은 이 값이 바뀔 때만 다시 만듭니다. 매번 새 객체를 주면 화면을 그릴 때마다
   * 마커가 새로 만들어지고, 안드로이드 지도는 그때마다 마커를 그림으로 다시 구워
   * 지도가 버벅입니다.
   */
  const myStatus = useMemo(
    () => status,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status?.text, status?.kind],
  );

  const markers = useMemo<MapMarkerItem[]>(() => {
    const items: MapMarkerItem[] = [];
    /**
     * 사람 한 명 = 핀 + 핀 위 배지 (피그마 `Component 20` · 지도 메인 548·550, 2026-10-07).
     * 핀은 캐릭터 그림이거나 이름 핀(PinMarker.tsx), 배지는 글자라 뷰로 따로 겁니다.
     */
    const 사람 = (p: {
      id: string;
      coordinate: LatLng;
      name: string;
      avatarUrl?: string;
      isMe?: boolean;
      status: ReturnType<typeof statusText>;
      battery?: number | null;
      /** 이미 활성화된 사람을 다시 눌렀을 때 */
      onOpen?: () => void;
    }) => {
      const 활성 = activeId === p.id;
      // 겹칠 때 위에 오는 순서: 활성화된 사람 > 나 > 친구. 핀 < 배지 < 배지 속 그림 (GoogleMapImpl 이 +1)
      const 높이 = 활성 ? 30 : p.isMe ? 10 : 1;
      const onPress = () => (활성 ? p.onOpen?.() : setActiveId(p.id));
      // 배지·이름 핀 색: 다크(지도든 앱이든)면 모두 검정, 라이트면 모두 흰색 (대표님 10-12).
      // 예전에는 라이트에서도 활성화된 사람만 흰색이고 나머지는 검정이었습니다
      const 색 = mapIsDark || appIsDark ? 'dark' : 'light';
      const 핀 = personPin({ name: p.name, avatarUrl: p.avatarUrl, active: 활성, tone: 색 });
      // 활성화된 사람 발밑에 레이더 파동 (피그마 지도 메인 550, 114dp 동심원). 핀 꼬리 끝이 가운데
      if (활성) {
        // id 를 사람마다 바꾸지 않습니다. 활성화한 사람이 바뀌어도 마커를 떼었다 붙이지 않고 자리만 옮깁니다 (대표 리포트 4)
        items.push({ id: 'radar', coordinate: p.coordinate, zIndex: 0, children: null, sprite: { sheet: SPRITES.radar.lg, offset: { x: 0, y: 0 } } });
      }
      items.push({ id: p.id, coordinate: p.coordinate, zIndex: 높이, onPress, ...핀 });
      if (!p.status) return;
      const 그림 = badgeSprite(p.status.kind, p.id);
      items.push({
        id: `${p.id}:badge`,
        coordinate: p.coordinate,
        zIndex: 높이 + 1,
        // 핀 꼭대기 위 12dp 에 배지 바닥 (anchor 는 재기 전 짐작값)
        anchor: badgeAnchor(),
        lift: BADGE_BOTTOM_GAP,
        // 이 값이 바뀔 때만 배지를 다시 굽습니다 (TrackedMarker 설명 참고)
        trackKey: `${p.status.kind}|${p.status.text}|${p.battery ?? ''}|${색}`,
        children: <BadgeMarker status={p.status} battery={p.battery} tone={색} who={p.id} />,
        // 걷기·자전거·자동차는 피그마의 움직이는 그림 (spriteClock.ts)
        badgeSprite: 그림 ? { sheet: 그림 } : undefined,
        onPress,
      });
    };

    const 친구 = (f: Friend, coordinate: LatLng) =>
      사람({
        id: f.id,
        coordinate,
        name: f.nickname,
        avatarUrl: f.avatarUrl,
        // 친구 배지는 이동 속도·머문 시간만 (피그마: 검은 배지)
        status: statusText({ speedKmh: f.speedKmh, stayedSince: f.stayedSince }),
        onOpen: () => router.push(`/journey/${f.id}`),
      });

    /**
     * 겹친 친구는 "3명" 하나로 묶습니다 (대표 리포트 78, 10-30 대표님 확정). 누르면 확대해서 펼치고,
     * 거의 같은 자리라 확대해도 안 갈라지면 목록에서 고릅니다. 활성화된 친구는 묶지 않고 늘 따로 보입니다
     */
    const located = friends.flatMap((f) => (f.location && f.id !== activeId ? [{ friend: f, coordinate: f.location as LatLng }] : []));
    const 겹침 = overlapDistanceM(visibleDelta, Dimensions.get('window').height);
    const 묶음색 = mapIsDark || appIsDark ? 'dark' : 'light';
    for (const group of clusterByDistance(located, 겹침)) {
      if (group.length === 1) {
        친구(group[0].friend, group[0].coordinate);
        continue;
      }
      const coords = group.map((g) => g.coordinate);
      items.push({
        id: `cluster:${group.map((g) => g.friend.id).sort().join(',')}`,
        coordinate: centerOf(coords),
        zIndex: 2,
        trackKey: `${group.length}|${묶음색}`,
        children: <ClusterPin count={group.length} tone={묶음색} label={t('map.clusterCount', { count: group.length })} />,
        onPress: () => {
          if (spreadM(coords) > SPREAD_TO_ZOOM_M) {
            setFollowing(false);
            mapRef.current?.fitTo(coords);
          } else {
            setClusterPick(group.map((g) => g.friend));
          }
        },
      });
    }
    const active = friends.find((f) => f.id === activeId);
    if (active?.location) 친구(active, active.location);
    if (location && me) {
      사람({
        id: 'me',
        coordinate: location,
        name: me.nickname,
        avatarUrl: me.avatarUrl,
        isMe: true,
        status: myStatus,
        battery: myBattery,
      });
      // 걷는 중이면 핀 오른쪽으로 발자국이 찍혀 나갑니다 (피그마 지도 메인 550: 핀 꼬리 끝에서 +83, +10)
      if (myStatus?.kind === 'walking') {
        items.push({
          id: 'me:footprints',
          coordinate: location,
          zIndex: 9,
          children: null,
          sprite: { sheet: SPRITES.footprints.lg, offset: { x: 83, y: 10 } },
        });
      }
    }
    return items;
  }, [friends, location, me, myStatus, myBattery, activeId, mapIsDark, appIsDark, visibleDelta, t]);

  // GPS 감도 원 (WBS 2.6): 오차 반경이 클수록 원이 커짐
  const circles = useMemo<MapCircleItem[]>(() => {
    if (!location?.accuracy) return [];
    const c = signalColors(colors)[signal];
    return [{ id: 'accuracy', center: location, radiusM: location.accuracy, fillColor: c.fill, strokeColor: c.stroke }];
  }, [location, signal]);

  return (
    <View style={styles.container}>
      {focused ? <StatusBar style={mapIsDark ? 'light' : 'dark'} /> : null}

      <AppMapView
        ref={mapRef}
        initialCenter={location ?? FALLBACK_CENTER}
        markers={markers}
        circles={circles}
        // 빈 곳을 누르면 다시 나를 활성화. 누가 눌렸는지는 지도가 판정합니다 (GoogleMapImpl useMarkerPress)
        onPress={() => {
          setActiveId('me');
          setClusterPick(null);
        }}
        onUserGesture={() => setFollowing(false)}
        onVisibleDelta={setVisibleDelta}
        padding={{
          top: insets.top + TOP_ROW_HEIGHT + (hiding ? 40 : 0),
          right: 0,
          bottom: (sheetIndex === 0 ? SHEET_COLLAPSED : SHEET_HEIGHT) + SHEET_GAP,
          left: 0,
        }}
        traffic={showTraffic}
      />

      {/*
        지도 탭이 안 보일 때는 지도 위 버튼·시트를 그리지 않습니다. 갤러리 탭 위로 지도 시트·버튼이 비쳐
        시트가 두 개 겹쳐 보였습니다 (대표 리포트 72)
      */}
      {focused ? (
      <>
      <SafeAreaView edges={['top']} style={styles.overlayTop} pointerEvents="box-none">
        <View style={styles.topRow} pointerEvents="box-none">
          <View style={styles.addressBlock}>
            {/* 피그마는 36(display)인데, 실제 지도 위에서는 도로명과 겹쳐 너무 커 보여 28 로 줄이고
                바탕 지도 글씨와 섞이지 않게 둘레에 바탕색 테두리를 둡니다 (대표님 10-08) */}
            <AppText
              variant="title1"
              color={overlay.text}
              numberOfLines={1}
              // 테두리는 글자와 반대 밝기여야 합니다. 버튼색(pill)은 앱 다크 모드를 따라가서 쓰면 안 됩니다
              style={{ textShadowColor: mapIsDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 6 }}
            >
              {areaName ?? (permission === 'granted' ? t('map.locating') : '')}
            </AppText>
            <WeatherBadge weather={weather} />
          </View>
          <View style={styles.topButtons}>
            <Pressable accessibilityLabel={t('map.profile')} onPress={() => router.push('/settings')}>
              <Avatar name={me?.nickname ?? ''} imageUrl={me?.avatarUrl} />
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.push('/sos')} style={overlayStyles.pillButton}>
              <AppText variant="headline" color={overlay.pillText}>
                {t('map.sos')}
              </AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('map.myLocation')}
              disabled={!location}
              onPress={() => {
                if (!location) return;
                // 다시 나를 따라갑니다
                setActiveId('me');
                setFollowing(true);
                mapRef.current?.moveTo(location);
              }}
              style={[overlayStyles.roundButton, !location && styles.disabled]}
            >
              <Ionicons name="locate" size={20} color={overlay.pillText} />
            </Pressable>
            {/* 로드뷰(거리뷰)는 네이버 지도 기능이라 유료 플랜에서만 (WBS 10.5) */}
            {streetView ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('map.streetView')}
              disabled={!streetViewTarget}
              onPress={() =>
                streetViewTarget &&
                (can('premiumMap')
                  ? router.push({
                      pathname: '/street-view',
                      params: { lat: streetViewTarget.latitude, lng: streetViewTarget.longitude, name: streetViewTarget.name },
                    })
                  : showToast(t('streetView.premiumOnly', { plan: PLAN_NAMES[minPlanFor('premiumMap')] })))
              }
              style={[overlayStyles.roundButton, !streetViewTarget && styles.disabled]}
            >
              <Ionicons name="man-outline" size={20} color={overlay.pillText} />
            </Pressable>
            ) : null}
          </View>
        </View>

        {hiding ? (
          <View style={overlayStyles.hideBar}>
            <Pressable accessibilityRole="button" onPress={() => router.push('/settings/hide-mode')} hitSlop={6} style={styles.hideBarLabel}>
              <Ionicons name="eye-off-outline" size={16} color={overlay.pillText} />
              <AppText variant="label2Bold" color={overlay.pillText}>
                {t('map.hiding')}
              </AppText>
            </Pressable>
            <AppText variant="label2" color={overlay.pillText}>
              {'\u00B7'}
            </AppText>
            <Pressable
              accessibilityRole="button"
              disabled={saveHideMode.isPending}
              onPress={() => hideMode && saveHideMode.mutate({ ...hideMode, hideAll: false, until: null })}
              hitSlop={8}
            >
              <AppText variant="label2Bold" color={colors.primary}>
                {t('map.hidingOff')}
              </AppText>
            </Pressable>
          </View>
        ) : null}

        {permission === 'denied' ? (
          <Pressable onPress={() => Linking.openSettings()} style={styles.permissionBanner}>
            <AppText variant="label2" color={colors.white} style={styles.flex}>
              {t('map.locationDenied')}
            </AppText>
            <AppText variant="label2Bold" color={colors.white}>
              {t('map.openSettings')}
            </AppText>
          </Pressable>
        ) : null}
      </SafeAreaView>

      {/* 위치 수집이 꺼져 있으면 켜자고 묻습니다 (TrackingPrompt 설명) */}
      <TrackingPrompt />

      <SnapSheet
        ref={sheetRef}
        snapPoints={[SHEET_COLLAPSED, SHEET_HEIGHT]}
        // 처음엔 지도만 보이게 친구 목록은 접어 둡니다. 끌어 올리면 펼쳐집니다 (대표님 10-08)
        initialIndex={0}
        onIndexChange={setSheetIndex}
        above={
          clusterPick ? (
            <ClusterPicker friends={clusterPick} onPick={focusFriend} onClose={() => setClusterPick(null)} />
          ) : activeFriend && previewAt && streetView && can('premiumMap') ? (
            <StreetViewPreview key={activeFriend.id} coordinate={previewAt} name={activeFriend.nickname} onClose={() => setActiveId('me')} />
          ) : null
        }
        // 광고 자리 글자·GPS 신호 아이콘은 뺐습니다 (대표 리포트 83). 광고가 붙으면 above 에 배너를 넣습니다
        // TODO(7단계): AdMob 배너. 광고 없는 등급(정책 ads = none: 유료·케어)은 표시하지 않습니다
        header={
          // 친구 추가는 People 에서만 합니다 (대표 리포트 16). 새 친구 요청 표시(N)는 요청 목록으로 갑니다
          <View style={styles.sheetHeader}>
            <View style={styles.friendsTitle}>
              <Ionicons name="people-outline" size={20} color={colors.text} />
              <AppText variant="body2Bold">{t('map.friends', { count: friends.length })}</AppText>
              {hasNewRequests ? (
                <Pressable onPress={() => router.push('/friends/requests')} hitSlop={8} style={styles.newBadge}>
                  <AppText variant="microBold" color={colors.white}>
                    N
                  </AppText>
                </Pressable>
              ) : null}
            </View>
          </View>
        }
      >
        {/* 시트에는 친구 목록만 (대표 리포트 7·61). 위치 확인 기록은 나의 프로필 > 위치 확인 기록 으로 옮겼습니다 */}
        <SheetScrollView contentContainerStyle={styles.sheetContent}>
          {friends.map((friend) => (
            <FriendRow
              key={friend.id}
              friend={friend}
              // 10-30 대표님 확정: 친구를 누르면 지도에서 그 친구 위치 (동선은 지도에서 그 친구를 한 번 더 누르면)
              onPress={() => focusFriend(friend)}
            />
          ))}
        </SheetScrollView>
      </SnapSheet>
      </>
      ) : null}
    </View>
  );
}

/** 겹친 친구 묶음 핀 ("3명") */
function ClusterPin({ count, tone, label }: { count: number; tone: 'light' | 'dark'; label: string }) {
  const styles = useStyles();
  const dark = tone === 'dark';
  return (
    <View accessibilityLabel={label} style={[styles.clusterPin, dark ? styles.clusterPinDark : styles.clusterPinLight]}>
      <Ionicons name="people" size={16} color={dark ? '#FFFFFF' : '#0C0D0E'} />
      <AppText variant="body2Bold" color={dark ? '#FFFFFF' : '#0C0D0E'}>
        {label}
      </AppText>
    </View>
  );
}

/** 거의 같은 자리에 있는 친구들 중 고르기 */
function ClusterPicker({ friends, onPick, onClose }: { friends: Friend[]; onPick: (f: Friend) => void; onClose: () => void }) {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  return (
    <View style={styles.floatCard}>
      <View style={styles.floatHeader}>
        <AppText variant="body2Bold" style={styles.flex}>
          {t('map.clusterTitle', { count: friends.length })}
        </AppText>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} hitSlop={8} onPress={onClose}>
          <Ionicons name="close" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>
      {friends.map((f) => (
        <Pressable key={f.id} accessibilityRole="button" onPress={() => onPick(f)} style={styles.pickRow}>
          <Avatar name={f.nickname} imageUrl={f.avatarUrl} />
          <AppText variant="body2" style={styles.flex} numberOfLines={1}>
            {f.nickname}
          </AppText>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        </Pressable>
      ))}
    </View>
  );
}

/** 고른 친구 자리의 로드뷰 미리보기 (네이버 지도일 때). 누르면 크게 봅니다 */
function StreetViewPreview({ coordinate, name, onClose }: { coordinate: LatLng; name: string; onClose: () => void }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const open = () => router.push({ pathname: '/street-view', params: { lat: coordinate.latitude, lng: coordinate.longitude, name } });
  return (
    <View style={[styles.floatCard, styles.previewCard]}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <StreetViewWeb coordinate={coordinate} />
      </View>
      {/* 미리보기 안에서 돌리지 않고, 누르면 큰 화면으로 */}
      <Pressable accessibilityRole="button" accessibilityLabel={t('map.streetViewOf', { name })} onPress={open} style={StyleSheet.absoluteFill} />
      <View style={styles.previewTop} pointerEvents="box-none">
        <View style={styles.previewLabel}>
          <Ionicons name="man-outline" size={14} color="#FFFFFF" />
          <AppText variant="label2Bold" color="#FFFFFF" numberOfLines={1}>
            {t('map.streetViewOf', { name })}
          </AppText>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} hitSlop={8} onPress={onClose} style={styles.previewClose}>
          <Ionicons name="close" size={16} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: '#ECEAE4' },
  flex: { flex: 1 },
  overlayTop: { position: 'absolute', top: 0, left: 0, right: 0 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: layout.screenPadding, paddingTop: 8 },
  addressBlock: { flex: 1, gap: 4 },
  address: { flex: 1 },
  topButtons: { alignItems: 'flex-end', gap: 12, paddingTop: 8 },
  disabled: { opacity: 0.4 },
  permissionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: layout.screenPadding,
    marginTop: 12,
    padding: 12,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(46,52,56,0.9)',
  },
  hideBarLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  friendsTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  newBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetContent: { paddingHorizontal: layout.screenPadding, paddingBottom: 24, gap: 12 },
  clusterPin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  clusterPinDark: { backgroundColor: '#0C0D0E' },
  clusterPinLight: { backgroundColor: '#FFFFFF' },
  floatCard: {
    marginHorizontal: layout.screenPadding,
    marginBottom: 12,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    padding: 12,
    gap: 4,
    elevation: 4,
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  floatHeader: { flexDirection: 'row', alignItems: 'center', paddingBottom: 4 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  previewCard: { height: 160, padding: 0, overflow: 'hidden', backgroundColor: '#000000' },
  previewTop: { position: 'absolute', top: 8, left: 8, right: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  previewLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
    paddingHorizontal: 10,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  previewClose: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' },
}));

/**
 * 지도 위에 얹는 버튼들 — 앱 화면 색이 아니라 지도 밝기를 따라갑니다.
 *
 * 그림자를 넣는 이유: 알약 바탕(#F7F7F8)이 밝은 지도 바탕과 거의 같은 색이라,
 * 폰에서 재 보니 차이가 1~2 밖에 안 나 버튼이 안 보였습니다. 글자·아이콘만
 * 공중에 떠 있는 것처럼 보입니다.
 */
const BUTTON_SHADOW = {
  elevation: 3,
  shadowColor: '#000000',
  shadowOpacity: 0.18,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 2 },
} as const;

const useOverlayStyles = makeMapStyles((overlay) => ({
  pillButton: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    backgroundColor: overlay.pill,
    alignItems: 'center',
    justifyContent: 'center',
    ...BUTTON_SHADOW,
  },
  // 숨기기 모드 띠 (대표 리포트 90)
  hideBar: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 32,
    paddingHorizontal: 14,
    marginTop: 8,
    borderRadius: radius.full,
    backgroundColor: overlay.pill,
    ...BUTTON_SHADOW,
  },
  roundButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: overlay.pill,
    alignItems: 'center',
    justifyContent: 'center',
    ...BUTTON_SHADOW,
  },
}));
