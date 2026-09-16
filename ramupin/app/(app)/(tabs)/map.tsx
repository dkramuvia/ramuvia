import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Battery from 'expo-battery';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { feedApi } from '@/api';
import { AppText, Avatar, BatteryBadge, SheetScrollView, SnapSheet } from '@/components/ui';
import { FriendRow } from '@/features/friends/FriendRow';
import { useFriendRequests, useFriends } from '@/features/friends/queries';
import { gpsSignal, moveMode, type GpsSignal, type MoveMode } from '@/features/location/signal';
import { useAreaName } from '@/features/location/useAreaName';
import { useLocationUpload } from '@/features/location/useLocationUpload';
import { useMyLocation } from '@/features/location/useMyLocation';
import { AppMapView, type AppMapViewHandle, type MapCircleItem, type MapMarkerItem } from '@/features/map/AppMapView';
import { AvatarMarker } from '@/features/map/AvatarMarker';
import { useAuthStore } from '@/stores/authStore';
import { colors, layout, radius } from '@/theme';
import type { FeedItemType, LatLng } from '@/types/models';
import { formatMonthDayTime } from '@/utils/time';

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

const SIGNAL_COLORS: Record<GpsSignal, { fill: string; stroke: string; icon: string }> = {
  good: { fill: 'rgba(0,149,255,0.12)', stroke: 'rgba(0,149,255,0.5)', icon: colors.battery },
  fair: { fill: 'rgba(253,184,18,0.15)', stroke: 'rgba(253,184,18,0.6)', icon: '#FDB812' },
  poor: { fill: 'rgba(255,30,0,0.10)', stroke: 'rgba(255,30,0,0.45)', icon: colors.danger },
};

const MOVE_ICONS: Record<MoveMode, ComponentProps<typeof Ionicons>['name']> = {
  stay: 'pause-circle',
  walk: 'walk',
  bike: 'bicycle',
  car: 'car',
  train: 'train',
  plane: 'airplane',
};

type SheetContent = 'feed' | 'friends';

/** 피그마: 지도 메인 (283:17631 알림 / 283:18094 친구 리스트 / 283:17676 이동 중) */
export default function MapScreen() {
  const { t } = useTranslation();
  const me = useAuthStore((s) => s.user);
  const mapRef = useRef<AppMapViewHandle>(null);
  const [sheet, setSheet] = useState<SheetContent>('feed');

  const { permission, location } = useMyLocation();
  useLocationUpload(location);
  // 기기 배터리 (-1 = 알 수 없음 → 프로필 값 사용)
  const deviceBattery = Battery.useBatteryLevel();
  const myBattery = deviceBattery >= 0 ? Math.round(deviceBattery * 100) : me?.batteryLevel;
  const areaName = useAreaName(location);
  const { data: friends = [] } = useFriends();
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
  const mode = moveMode(location?.speedKmh ?? null);

  const markers = useMemo<MapMarkerItem[]>(() => {
    const items: MapMarkerItem[] = friends
      .filter((f) => f.location)
      .map((f) => ({
        id: f.id,
        coordinate: f.location!,
        children: <AvatarMarker name={f.nickname} imageUrl={f.avatarUrl} online={f.isOnline} />,
        onPress: () => router.push(`/journey/${f.id}`),
      }));
    if (location && me) {
      items.push({
        id: 'me',
        coordinate: location,
        zIndex: 10,
        children: <AvatarMarker name={me.nickname} imageUrl={me.avatarUrl} isMe />,
      });
    }
    return items;
  }, [friends, location, me]);

  // GPS 감도 원 (WBS 2.6): 오차 반경이 클수록 원이 커짐
  const circles = useMemo<MapCircleItem[]>(() => {
    if (!location?.accuracy) return [];
    const c = SIGNAL_COLORS[signal];
    return [{ id: 'accuracy', center: location, radiusM: location.accuracy, fillColor: c.fill, strokeColor: c.stroke }];
  }, [location, signal]);

  return (
    <View style={styles.container}>
      <AppMapView
        ref={mapRef}
        initialCenter={location ?? FALLBACK_CENTER}
        markers={markers}
        circles={circles}
        padding={{ top: 120, right: 0, bottom: SHEET_HEIGHT + AD_HEIGHT + 40, left: 0 }}
      />

      <SafeAreaView edges={['top']} style={styles.overlayTop} pointerEvents="box-none">
        <View style={styles.topRow} pointerEvents="box-none">
          <AppText variant="display" color={colors.textStrong} numberOfLines={1} style={styles.address}>
            {areaName ?? (permission === 'granted' ? t('map.locating') : '')}
          </AppText>
          <View style={styles.topButtons}>
            <Pressable accessibilityLabel={t('map.profile')} onPress={() => router.push('/settings')}>
              <Avatar name={me?.nickname ?? ''} imageUrl={me?.avatarUrl} />
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.push('/sos')} style={styles.pillButton}>
              <AppText variant="headline" color={colors.black}>
                {t('map.sos')}
              </AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('map.myLocation')}
              disabled={!location}
              onPress={() => location && mapRef.current?.moveTo(location)}
              style={[styles.roundButton, !location && styles.disabled]}
            >
              <Ionicons name="locate" size={20} color={colors.text} />
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
            {location ? (
              <View style={styles.statusChip}>
                <Ionicons name={MOVE_ICONS[mode]} size={20} color={colors.text} />
                <AppText variant="body2Bold">
                  {mode === 'stay' ? t('map.staying') : t('map.moving', { speed: Math.round(location.speedKmh ?? 0) })}
                </AppText>
                {myBattery != null ? <BatteryBadge level={myBattery} textVariant="body2Bold" /> : null}
                <View style={styles.signal} accessibilityLabel={t(`map.signal.${signal}`)}>
                  <Ionicons name="cellular" size={14} color={SIGNAL_COLORS[signal].icon} />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ECEAE4' },
  flex: { flex: 1 },
  overlayTop: { position: 'absolute', top: 0, left: 0, right: 0 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: layout.screenPadding, paddingTop: 8 },
  address: { flex: 1 },
  topButtons: { alignItems: 'flex-end', gap: 12, paddingTop: 8 },
  pillButton: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    backgroundColor: 'rgba(247,247,248,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(247,247,248,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  adBanner: {
    height: AD_HEIGHT,
    marginHorizontal: 30,
    marginBottom: 20,
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
});
