import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Battery from 'expo-battery';
import { router, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { feedApi } from '@/api';
import { AppText, Avatar, SheetScrollView, SnapSheet } from '@/components/ui';
import { FriendRow } from '@/features/friends/FriendRow';
import { useFriendRequests, useFriends } from '@/features/friends/queries';
import { gpsSignal, type GpsSignal } from '@/features/location/signal';
import { getActivity } from '../../../modules/ramupin-gps';
import { stayedSince } from '@/features/location/backgroundTask';
import { useAreaName } from '@/features/location/useAreaName';
import { useLocationUpload } from '@/features/location/useLocationUpload';
import { useMyLocation } from '@/features/location/useMyLocation';
import { AppMapView, type AppMapViewHandle, type MapCircleItem, type MapMarkerItem } from '@/features/map/AppMapView';
import { AvatarMarker } from '@/features/map/AvatarMarker';
import { statusText } from '@/features/map/statusText';
import { WeatherBadge } from '@/features/weather/WeatherBadge';
import { useWeather } from '@/features/weather/useWeather';
import { PLAN_NAMES } from '@/features/policy/policies';
import { usePlan } from '@/features/policy/usePlan';
import { useAuthStore } from '@/stores/authStore';
import { layout, makeMapStyles, makeStyles, radius, useColors, useMapIsDark, useMapOverlay, type Palette } from '@/theme';
import type { FeedItemType, LatLng } from '@/types/models';
import { formatMonthDayTime } from '@/utils/time';
import { showToast } from '@/utils/toast';
import { useWatchFriends } from '@/features/location/useWatchFriends';

const FEED_ICONS: Partial<Record<FeedItemType, number>> = {
  stay: require('../../../assets/icons/feed-stay.png'),
  nearby: require('../../../assets/icons/feed-nearby.png'),
  checkedLocation: require('../../../assets/icons/feed-checked.png'),
};

// 위치를 받기 전 첫 화면 중심 (강남역)
const FALLBACK_CENTER: LatLng = { latitude: 37.4979, longitude: 127.0276 };

const SHEET_HEIGHT = 370;
// 내렸을 때 손잡이와 "친구 (N) / 친구추가" 줄만 보이는 높이
const SHEET_COLLAPSED = 78;
const AD_HEIGHT = 50;

const signalColors = (colors: Palette): Record<GpsSignal, { fill: string; stroke: string; icon: string }> => ({
  good: { fill: 'rgba(0,149,255,0.12)', stroke: 'rgba(0,149,255,0.5)', icon: colors.battery },
  fair: { fill: 'rgba(253,184,18,0.15)', stroke: 'rgba(253,184,18,0.6)', icon: '#FDB812' },
  poor: { fill: 'rgba(255,30,0,0.10)', stroke: 'rgba(255,30,0,0.45)', icon: colors.danger },
});

type SheetContent = 'feed' | 'friends';

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
  const focused = useIsFocused();
  const { t } = useTranslation();
  const me = useAuthStore((s) => s.user);
  const mapRef = useRef<AppMapViewHandle>(null);
  const [sheet, setSheet] = useState<SheetContent>('feed');

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
  const { data: feed = [] } = useQuery({ queryKey: ['feed'], queryFn: feedApi.list });
  const hasNewRequests = (requests?.received.length ?? 0) > 0;

  // 첫 위치를 받으면 한 번만 내 위치로 이동 (initialCenter 는 처음 그릴 때만 적용됨)
  const centeredOnce = useRef(false);
  useEffect(() => {
    if (!location || centeredOnce.current) return;
    centeredOnce.current = true;
    mapRef.current?.moveTo(location);
  }, [location]);

  const signal = gpsSignal(location?.accuracy ?? null);

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
  const myStatus = statusText({ activity: getActivity()?.type, speedKmh: location?.speedKmh, stayedSince: myStayedSince });

  const markers = useMemo<MapMarkerItem[]>(() => {
    const items: MapMarkerItem[] = friends
      .filter((f) => f.location)
      .map((f) => ({
        id: f.id,
        coordinate: f.location!,
        label: f.nickname,
        tintColor: f.isOnline ? colors.check : colors.textMuted,
        children: (
          <AvatarMarker
            name={f.nickname}
            imageUrl={f.avatarUrl}
            online={f.isOnline}
            // 친구 배지는 머문 시간만 보여 줍니다 (피그마 2026-09-28: 검은 배지)
            status={statusText({ speedKmh: f.speedKmh, stayedSince: f.stayedSince })}
          />
        ),
        onPress: () => router.push(`/journey/${f.id}`),
      }));
    if (location && me) {
      items.push({
        id: 'me',
        coordinate: location,
        zIndex: 10,
        label: me.nickname,
        tintColor: colors.primary,
        children: (
          <AvatarMarker
            name={me.nickname}
            imageUrl={me.avatarUrl}
            isMe
            status={myStatus}
            battery={myBattery}
          />
        ),
      });
    }
    return items;
  }, [friends, location, me, myStatus, myBattery]);

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
        padding={{ top: 120, right: 0, bottom: SHEET_HEIGHT + AD_HEIGHT + 40, left: 0 }}
      />

      <SafeAreaView edges={['top']} style={styles.overlayTop} pointerEvents="box-none">
        <View style={styles.topRow} pointerEvents="box-none">
          <View style={styles.addressBlock}>
            <AppText variant="display" color={overlay.text} numberOfLines={1}>
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
              onPress={() => location && mapRef.current?.moveTo(location)}
              style={[overlayStyles.roundButton, !location && styles.disabled]}
            >
              <Ionicons name="locate" size={20} color={overlay.pillText} />
            </Pressable>
            {/* 로드뷰(거리뷰)는 네이버 지도 기능이라 유료 플랜에서만 (WBS 10.5) */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('map.streetView')}
              disabled={!location}
              onPress={() =>
                location &&
                (can('premiumMap')
                  ? router.push({ pathname: '/street-view', params: { lat: location.latitude, lng: location.longitude, name: areaName ?? '' } })
                  : showToast(t('streetView.premiumOnly', { plan: PLAN_NAMES[minPlanFor('premiumMap')] })))
              }
              style={[overlayStyles.roundButton, !location && styles.disabled]}
            >
              <Ionicons name="man-outline" size={20} color={overlay.pillText} />
            </Pressable>
          </View>
        </View>

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

      <SnapSheet
        snapPoints={[SHEET_COLLAPSED, SHEET_HEIGHT]}
        above={
          <>
            {/* 이동 상태·배터리는 2026-09-28 디자인부터 마커 아래 배지로 갑니다 (AvatarMarker).
                GPS 감도는 배지에 자리가 없어 여기 작은 점으로만 남깁니다 (WBS 2.6) */}
            {location ? (
              <View style={styles.signalRow}>
                <View style={styles.signal} accessibilityLabel={t(`map.signal.${signal}`)}>
                  <Ionicons name="cellular" size={14} color={signalColors(colors)[signal].icon} />
                </View>
              </View>
            ) : null}

            {/* TODO(7단계): AdMob 배너. 노인·유료 사용자는 표시하지 않음 */}
            <View style={styles.adBanner}>
              <AppText variant="label2" color={colors.textMuted}>
                {t('map.adArea')}
              </AppText>
            </View>
          </>
        }
        header={
          <View style={styles.sheetHeader}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setSheet((s) => (s === 'feed' ? 'friends' : 'feed'))}
              style={styles.friendsToggle}
            >
              <Ionicons name="people-outline" size={20} color={colors.text} />
              <AppText variant="body2Bold">{t('map.friends', { count: friends.length })}</AppText>
              {hasNewRequests ? (
                <Pressable onPress={() => router.push('/friends/requests')} hitSlop={8} style={styles.newBadge}>
                  <AppText variant="microBold" color={colors.white}>
                    N
                  </AppText>
                </Pressable>
              ) : null}
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.push('/friends/add')} style={styles.addFriend}>
              <AppText variant="body1Regular" color={colors.textMuted}>
                {t('map.addFriend')}
              </AppText>
              <Ionicons name="add-circle-outline" size={24} color={colors.textMuted} />
            </Pressable>
          </View>
        }
      >
        <SheetScrollView contentContainerStyle={styles.sheetContent}>
          {sheet === 'feed'
            ? feed.map((item) => (
                <View key={item.id} style={styles.feedItem}>
                  {FEED_ICONS[item.type] ? (
                    <Image source={FEED_ICONS[item.type]} style={styles.feedIcon} />
                  ) : (
                    <View style={styles.feedIcon} />
                  )}
                  <View style={styles.feedTexts}>
                    <AppText variant="headlineMedium">{item.message}</AppText>
                    <AppText variant="body2" color={colors.textPlaceholder}>
                      {formatMonthDayTime(item.createdAt)}
                    </AppText>
                  </View>
                </View>
              ))
            : friends.map((friend) => (
                <FriendRow
                  key={friend.id}
                  friend={friend}
                  // 기획: 친구 리스트에서 친구를 누르면 그 친구의 하루 여정과 상호작용 기록
                  onPress={() => {
                    if (friend.location) mapRef.current?.moveTo(friend.location, 0.006);
                    router.push(`/journey/${friend.id}`);
                  }}
                />
              ))}
        </SheetScrollView>
      </SnapSheet>
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
  signalRow: { alignSelf: 'center', marginBottom: 12 },
  statusChip: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderRadius: radius.full,
    backgroundColor: colors.white,
    elevation: 2,
  },
  signal: { marginLeft: 2 },
  // 피그마: 343x50, 좌우 여백 30, 모서리 4. AdMob 배너가 이 자리에 그대로 들어갑니다
  adBanner: {
    height: AD_HEIGHT,
    marginHorizontal: 30,
    marginBottom: 20,
    borderRadius: 4,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  friendsToggle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  newBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addFriend: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sheetContent: { paddingHorizontal: layout.screenPadding, paddingBottom: 24, gap: 12 },
  feedItem: { flexDirection: 'row', gap: 16, paddingVertical: 8 },
  feedIcon: { width: 48, height: 48 },
  feedTexts: { flex: 1, gap: 12 },
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
