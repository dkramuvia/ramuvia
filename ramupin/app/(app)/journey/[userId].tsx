import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, BatteryBadge, BottomNav } from '@/components/ui';
import { useFriends } from '@/features/friends/queries';
import { allRouteCoordinates, formatDuration, minutesSince, routePolylines } from '@/features/journey/routeLayers';
import { useAreaName } from '@/features/location/useAreaName';
import { AppMapView, type AppMapViewHandle, type MapMarkerItem } from '@/features/map/AppMapView';
import { AvatarMarker } from '@/features/map/AvatarMarker';
import { useJourney } from '@/features/settings/queries';
import { useAuthStore } from '@/stores/authStore';
import { formatDistance, usePreferencesStore } from '@/stores/preferencesStore';
import { colors, layout, radius } from '@/theme';

const PLACE_PIN = require('../../../assets/icons/place-pin.png');
const FALLBACK = { latitude: 37.4979, longitude: 127.0276 };
const SHEET_RATIO = 0.62;

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
  const mapRef = useRef<AppMapViewHandle>(null);

  const isMe = userId === me?.id;
  const friend = friends.find((f) => f.id === userId);
  const name = isMe ? me?.nickname : friend?.nickname;
  const [view, setView] = useState<'summary' | 'timeline'>(isMe || params.view === 'timeline' ? 'timeline' : 'summary');

  const lastStop = journey?.stops[journey.stops.length - 1];
  const current = lastStop ?? friend?.location ?? null;
  const areaName = useAreaName(current);

  useEffect(() => {
    if (journey) mapRef.current?.fitTo(allRouteCoordinates(journey));
  }, [journey]);

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
        padding={{ top: 100, right: 20, bottom: 520, left: 20 }}
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

      <View style={styles.sheet}>
        {/* 기획: 바텀시트를 내리면 이동 경로를 지도로 볼 수 있음 → 손잡이를 누르면 이동경로 화면 */}
        <Pressable accessibilityRole="button" accessibilityLabel={t('journey.viewRoute')} onPress={() => router.push(`/journey/route/${userId}`)} style={styles.grabberArea}>
          <View style={styles.grabber} />
        </Pressable>
        <ScrollView contentContainerStyle={styles.sheetContent}>
          <View style={styles.nameRow}>
            <AppText variant="title2" style={styles.flex} numberOfLines={1}>
              {isMe ? t('journey.myTitle') : name}
            </AppText>
            {battery != null ? <BatteryBadge level={battery} textVariant="micro" /> : null}
          </View>

          {isLoading ? <ActivityIndicator color={colors.brown} /> : null}

          {!isLoading && view === 'summary' ? (
            <>
              <NowRow />
              {friend?.location?.address ? <AppText variant="label1">{friend.location.address}</AppText> : null}
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
        </ScrollView>
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
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: `${SHEET_RATIO * 100}%`,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.background,
  },
  grabberArea: { paddingVertical: 12, alignItems: 'center' },
  grabber: { width: 58, height: 4, borderRadius: 2, backgroundColor: '#B9B9B9' },
  sheetContent: { paddingHorizontal: layout.screenPadding, paddingBottom: 24, gap: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
