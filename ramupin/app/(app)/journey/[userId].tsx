import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, BatteryBadge, BottomNav, SheetScrollView, SnapSheet } from '@/components/ui';
import { useFriends } from '@/features/friends/queries';
import { allRouteCoordinates, formatDuration, minutesSince, routePolylines } from '@/features/journey/routeLayers';
import { useAreaName } from '@/features/location/useAreaName';
import { AppMapView, type AppMapViewHandle, type MapMarkerItem } from '@/features/map/AppMapView';
import { AvatarMarker } from '@/features/map/AvatarMarker';
import { PLAN_NAMES } from '@/features/policy/policies';
import { usePlan } from '@/features/policy/usePlan';
import { useJourney } from '@/features/settings/queries';
import { isMeId, useAuthStore } from '@/stores/authStore';
import { formatDistance, usePreferencesStore } from '@/stores/preferencesStore';
import { colors, layout, radius } from '@/theme';
import { showToast } from '@/utils/toast';

const PLACE_PIN = require('../../../assets/icons/place-pin.png');
const FALLBACK = { latitude: 37.4979, longitude: 127.0276 };
const SHEET_RATIO = 0.62;
/** 내렸을 때: 손잡이 + 이름 줄만 보임 */
const SHEET_COLLAPSED = 90;

const timeText = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });

/**
 * 피그마: 친구 상세 (283:17712) → 최근 여정 (283:17799) / 나의 최근 여정 (283:26036)
 * 기획: 친구를 누르면 하루 이동 여정과 상호작용 기록, 이동경로를 비공개로 해놨으면 '최근 여정' 안 보임
 *       최근 여정 박스를 누르면 자세한 이동 여정, 장소 이름이 특정되면 제목·아니면 주소만
 */
export default function JourneyScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ userId: string; view?: 'timeline' }>();
  const { userId } = params;
  const me = useAuthStore((s) => s.user);
  const unit = usePreferencesStore((s) => s.distanceUnit);
  const { data: friends = [] } = useFriends();
  const { data: journey, isLoading } = useJourney(userId);
  const { can, minPlanFor } = usePlan();
  const mapRef = useRef<AppMapViewHandle>(null);

  const isMe = isMeId(userId, me);
  const friend = friends.find((f) => f.id === userId);
  const name = isMe ? me?.nickname : friend?.nickname;
  const [view, setView] = useState<'summary' | 'timeline'>(isMe || params.view === 'timeline' ? 'timeline' : 'summary');

  const lastStop = journey?.stops[journey.stops.length - 1];
  const current = lastStop ?? friend?.location ?? null;
  const areaName = useAreaName(current);

  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const navHeight = layout.tabBarHeight + insets.bottom;
  const expandedHeight = Math.round(screenHeight * SHEET_RATIO) - navHeight;
  // 지도가 시트에 가려지지 않도록 현재 시트 높이만큼 아래 여백
  const [sheetHeight, setSheetHeight] = useState(expandedHeight);

  useEffect(() => {
    if (journey) mapRef.current?.fitTo(allRouteCoordinates(journey));
  }, [journey, sheetHeight]);

  const markers = useMemo<MapMarkerItem[]>(() => {
    if (!current || !name) return [];
    return [{ id: 'person', coordinate: current, zIndex: 5, children: <AvatarMarker name={name} imageUrl={friend?.avatarUrl} isMe={isMe} /> }];
  }, [current, name, friend, isMe]);

  const battery = journey?.batteryLevel ?? friend?.batteryLevel;

  return (
    <View style={styles.container}>
      <AppMapView
        ref={mapRef}
        initialCenter={current ?? FALLBACK}
        initialDelta={0.02}
        markers={markers}
        polylines={journey ? routePolylines(journey) : []}
        padding={{ top: 100, right: 20, bottom: sheetHeight + navHeight, left: 20 }}
      />

      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <View style={styles.titleRow}>
          <Pressable accessibilityRole="button" onPress={() => (view === 'timeline' && !isMe && params.view !== 'timeline' ? setView('summary') : router.back())} hitSlop={8}>
            <Ionicons name="chevron-back" size={26} color={colors.textStrong} />
          </Pressable>
          <AppText variant="title1" color={colors.textStrong} numberOfLines={1} style={styles.flex}>
            {areaName ?? ''}
          </AppText>
        </View>
      </SafeAreaView>

      {/* 기획: 바텀시트를 내리면 이동 경로를 지도로 볼 수 있음 */}
      <SnapSheet
        snapPoints={[SHEET_COLLAPSED, expandedHeight]}
        bottomInset={navHeight}
        onIndexChange={(index) => setSheetHeight(index === 0 ? SHEET_COLLAPSED : expandedHeight)}
        header={
          <View style={styles.nameRow}>
            <AppText variant="title2" style={styles.flex} numberOfLines={1}>
              {isMe ? t('journey.myTitle') : name}
            </AppText>
            {battery != null ? <BatteryBadge level={battery} textVariant="micro" /> : null}
          </View>
        }
      >
        <SheetScrollView contentContainerStyle={styles.sheetContent}>
          {isLoading ? <ActivityIndicator color={colors.brown} /> : null}

          {!isLoading && view === 'summary' ? (
            <>
              <NowRow />
              {friend?.location?.address ? <AppText variant="label1">{friend.location.address}</AppText> : null}
              {/* 로드뷰(거리뷰)로 그 자리를 눈으로 확인 (WBS 10.5 유료 지도) */}
              {current ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    can('premiumMap')
                      ? router.push({ pathname: '/street-view', params: { lat: current.latitude, lng: current.longitude, name } })
                      : showToast(t('streetView.premiumOnly', { plan: PLAN_NAMES[minPlanFor('premiumMap')] }))
                  }
                  style={styles.routeLink}
                >
                  <Ionicons name="man-outline" size={18} color={colors.textSecondary} />
                  <AppText variant="label1" color={colors.textSecondary}>
                    {t('map.streetView')}
                  </AppText>
                </Pressable>
              ) : null}
              {journey ? (
                <Pressable accessibilityRole="button" onPress={() => setView('timeline')} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <AppText variant="title4" style={styles.flex}>
                      {t('journey.recent')}
                    </AppText>
                    <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
                  </View>
                  <AppText variant="label1" color={colors.textSecondary}>
                    {`오늘 ${timeText(journey.stops[0].arrivedAt)} - ${lastStop ? timeText(lastStop.arrivedAt) : ''}`}
                  </AppText>
                  <View style={styles.distance}>
                    <Image source={PLACE_PIN} style={styles.pin} />
                    <AppText variant="headline">{formatDistance(journey.totalDistanceM, unit)}</AppText>
                  </View>
                  <View style={styles.fromTo}>
                    <View style={styles.fromToRow}>
                      <Ionicons name="ellipse-outline" size={12} color={colors.textTertiary} />
                      <AppText variant="label1" color={colors.textSecondary}>
                        {journey.stops[0].address}
                      </AppText>
                    </View>
                    <View style={styles.fromToLine} />
                    <View style={styles.fromToRow}>
                      <Ionicons name="location" size={13} color={colors.textTertiary} />
                      <AppText variant="label1" color={colors.textSecondary}>
                        {lastStop?.address}
                      </AppText>
                    </View>
                  </View>
                </Pressable>
              ) : (
                <AppText variant="label1" color={colors.textMuted}>
                  {t('journey.hidden')}
                </AppText>
              )}
            </>
          ) : null}

          {!isLoading && view === 'timeline' && journey ? (
            <>
              <View style={styles.summaryRow}>
                <AppText variant="body2Bold" style={styles.flex}>
                  {t('history.totalDistance', { distance: formatDistance(journey.totalDistanceM, unit) })}
                </AppText>
                <View style={styles.visited}>
                  <Image source={PLACE_PIN} style={styles.pinSmall} />
                  <AppText variant="body2Bold">{t('history.visited', { count: journey.stops.length })}</AppText>
                </View>
              </View>
              <NowRow />
              {journey.stops.map((stop, i) => (
                <View key={stop.arrivedAt} style={styles.timelineItem}>
                  {i > 0 && stop.movedMinutesBefore ? (
                    <View style={styles.chip}>
                      <AppText variant="body2">{t('journey.moved', { minutes: stop.movedMinutesBefore })}</AppText>
                    </View>
                  ) : null}
                  <Pressable onPress={() => mapRef.current?.moveTo(stop, 0.005)} style={styles.stop}>
                    <View style={styles.flex}>
                      <AppText variant="body2Bold">{stop.placeName ?? stop.address}</AppText>
                      {stop.placeName ? (
                        <AppText variant="label1" color={colors.textSecondary}>
                          {stop.address}
                        </AppText>
                      ) : null}
                    </View>
                    <AppText variant="label2" color={colors.textSecondary}>
                      {timeText(stop.arrivedAt)}
                    </AppText>
                  </Pressable>
                </View>
              ))}
              {lastStop && !lastStop.leftAt ? (
                <View style={styles.chip}>
                  <AppText variant="body2">{t('journey.staying', { duration: formatDuration(minutesSince(lastStop.arrivedAt)) })}</AppText>
                </View>
              ) : null}
            </>
          ) : null}

          {!isLoading && journey ? (
            <Pressable accessibilityRole="button" onPress={() => router.push(`/journey/route/${userId}`)} style={styles.routeLink}>
              <Ionicons name="map-outline" size={18} color={colors.textSecondary} />
              <AppText variant="label1" color={colors.textSecondary}>
                {t('journey.viewRoute')}
              </AppText>
            </Pressable>
          ) : null}
        </SheetScrollView>
      </SnapSheet>
      <View style={styles.nav}>
        <BottomNav active="map" />
      </View>
    </View>
  );
}

function NowRow() {
  const { t } = useTranslation();
  return (
    <View style={styles.now}>
      <View style={styles.nowDot} />
      <AppText variant="label1">{t('journey.now')}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ECEAE4' },
  flex: { flex: 1 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: layout.screenPadding },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 12 },
  nav: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  routeLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  sheetContent: { paddingHorizontal: layout.screenPadding, paddingBottom: 24, gap: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: layout.screenPadding, paddingBottom: 12 },
  now: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nowDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.check },
  card: { borderRadius: radius.md, backgroundColor: colors.surface, padding: 12, gap: 8 },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  distance: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  pin: { width: 48, height: 48 },
  pinSmall: { width: 28, height: 28 },
  fromTo: { gap: 2 },
  fromToRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fromToLine: { width: 1, height: 12, marginLeft: 6, backgroundColor: colors.textMuted },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  visited: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  timelineItem: { gap: 12 },
  chip: { borderRadius: radius.md, backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 12 },
  stop: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 8 },
});
