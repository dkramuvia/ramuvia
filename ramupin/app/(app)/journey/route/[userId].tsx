import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, BottomNav } from '@/components/ui';
import { useFriends } from '@/features/friends/queries';
import { allRouteCoordinates, routePolylines } from '@/features/journey/routeLayers';
import { useAreaName } from '@/features/location/useAreaName';
import { AppMapView, type AppMapViewHandle, type MapMarkerItem } from '@/features/map/AppMapView';
import { AvatarMarker } from '@/features/map/AvatarMarker';
import { useJourney } from '@/features/settings/queries';
import { isMeId, useAuthStore } from '@/stores/authStore';
import { formatDistance, usePreferencesStore } from '@/stores/preferencesStore';
import { colors, layout } from '@/theme';

const FALLBACK = { latitude: 37.4979, longitude: 127.0276 };

/**
 * 피그마: 이동경로 (283:17881 / 나의 이동경로 283:26179)
 * 기획: 노란줄 = 정체 구간(머물러 있음), 파란 줄 = 이동 구간, 뒤로가기로 여정 화면
 */
export default function RouteScreen() {
  const { t } = useTranslation();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const me = useAuthStore((s) => s.user);
  const unit = usePreferencesStore((s) => s.distanceUnit);
  const { data: friends = [] } = useFriends();
  const { data: journey } = useJourney(userId);
  const mapRef = useRef<AppMapViewHandle>(null);

  const isMe = isMeId(userId, me);
  const friend = friends.find((f) => f.id === userId);
  const name = (isMe ? me?.nickname : friend?.nickname) ?? '';
  const first = journey?.stops[0];
  const last = journey?.stops[journey.stops.length - 1];
  const areaName = useAreaName(last ?? null);

  useEffect(() => {
    if (journey) mapRef.current?.fitTo(allRouteCoordinates(journey));
  }, [journey]);

  const markers = useMemo<MapMarkerItem[]>(() => {
    if (!first || !last) return [];
    return [
      { id: 'start', coordinate: first, children: <View style={styles.startDot} /> },
      { id: 'end', coordinate: last, zIndex: 5, children: <AvatarMarker name={name} imageUrl={friend?.avatarUrl} isMe={isMe} /> },
    ];
  }, [first, last, name, friend, isMe]);

  return (
    <View style={styles.container}>
      <AppMapView
        ref={mapRef}
        initialCenter={last ?? FALLBACK}
        initialDelta={0.02}
        markers={markers}
        polylines={journey ? routePolylines(journey) : []}
        padding={{ top: 120, right: 30, bottom: 220, left: 30 }}
      />

      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <View style={styles.titleRow}>
          <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={26} color={colors.textStrong} />
          </Pressable>
          <AppText variant="title1" color={colors.textStrong} numberOfLines={1} style={styles.flex}>
            {areaName ?? ''}
          </AppText>
        </View>
      </SafeAreaView>

      <View style={styles.sheet}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.grabberArea}>
          <View style={styles.grabber} />
        </Pressable>
        <View style={styles.sheetBody}>
          <AppText variant="title2">{t('journey.routeTitle', { name })}</AppText>
          {journey ? (
            <View style={styles.summary}>
              <AppText variant="body2" style={styles.flex}>
                {t('history.totalDistance', { distance: formatDistance(journey.totalDistanceM, unit) })}
              </AppText>
              <AppText variant="body2" style={styles.flex}>
                {t('history.visited', { count: journey.stops.length })}
              </AppText>
            </View>
          ) : (
            <AppText variant="label1" color={colors.textMuted}>
              {t('journey.hidden')}
            </AppText>
          )}
          <View style={styles.legend}>
            <View style={[styles.legendLine, { backgroundColor: colors.routeMove }]} />
            <AppText variant="caption">{t('journey.legendMove')}</AppText>
            <View style={[styles.legendLine, { backgroundColor: colors.routeStay }]} />
            <AppText variant="caption">{t('journey.legendStay')}</AppText>
          </View>
        </View>
        <BottomNav active="map" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ECEAE4' },
  flex: { flex: 1 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: layout.screenPadding },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 12 },
  startDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 3, borderColor: colors.routeMove, backgroundColor: colors.white },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.background },
  grabberArea: { paddingVertical: 12, alignItems: 'center' },
  grabber: { width: 58, height: 4, borderRadius: 2, backgroundColor: '#B9B9B9' },
  sheetBody: { paddingHorizontal: layout.screenPadding, paddingBottom: 16, gap: 12 },
  summary: { flexDirection: 'row' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendLine: { width: 20, height: 4, borderRadius: 2, marginLeft: 6 },
});
