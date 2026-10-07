import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, BottomNav } from '@/components/ui';
import { useFriends } from '@/features/friends/queries';
import { allRouteCoordinates, routePolylines } from '@/features/journey/routeLayers';
import { useAreaName } from '@/features/location/useAreaName';
import { AppMapView, type AppMapViewHandle, type MapMarkerItem } from '@/features/map/AppMapView';
import { personPin } from '@/features/map/PinMarker';
import { useJourney } from '@/features/settings/queries';
import { isMeId, useAuthStore } from '@/stores/authStore';
import { formatDistance, usePreferencesStore } from '@/stores/preferencesStore';
import { layout, makeStyles, useColors, useMapIsDark, useMapOverlay } from '@/theme';

const FALLBACK = { latitude: 37.4979, longitude: 127.0276 };

/**
 * 피그마: 이동경로 (283:17881 / 나의 이동경로 283:26179)
 * 기획: 노란줄 = 정체 구간(머물러 있음), 파란 줄 = 이동 구간, 뒤로가기로 여정 화면
 */
export default function RouteScreen() {
  const styles = useStyles();
  const colors = useColors();
  // 제목·뒤로가기가 지도 위에 바로 얹혀 있어, 앱 화면 색이 아니라 지도 밝기를 따라갑니다
  const overlay = useMapOverlay();
  const mapIsDark = useMapIsDark();
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
      // 핀: 캐릭터가 있으면 캐릭터, 없으면 이름 (PinMarker.tsx)
      { id: 'end', coordinate: last, zIndex: 5, ...personPin({ name, avatarUrl: isMe ? me?.avatarUrl : friend?.avatarUrl, active: isMe }) },
    ];
  }, [first, last, name, friend, isMe, me]);

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

      <StatusBar style={mapIsDark ? 'light' : 'dark'} />

      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <View style={styles.titleRow}>
          <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={26} color={overlay.text} />
          </Pressable>
          <AppText variant="title1" color={overlay.text} numberOfLines={1} style={styles.flex}>
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

const useStyles = makeStyles((colors) => ({
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
}));
