import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, BottomNav } from '@/components/ui';
import { useMyLocation } from '@/features/location/useMyLocation';
import { AppMapView, type AppMapViewHandle, type MapMarkerItem } from '@/features/map/AppMapView';
import { useJourneyStats } from '@/features/settings/queries';
import { formatDistance, usePreferencesStore } from '@/stores/preferencesStore';
import { layout, makeStyles, useColors, useMapIsDark, useMapOverlay } from '@/theme';

const FALLBACK = { latitude: 37.4979, longitude: 127.0276 };

/**
 * 최근 7일·30일 동안 머문 곳 지도 (대표 리포트 3차: 히스토리 > 나의 장소 기록의 최근 7일·30일을 누르면
 * 지도에 움직인 곳 표시). 많이 간 곳일수록 점이 크고 진합니다.
 * 며칠치 경로선을 모두 그리면 무겁고 겹쳐 알아보기 어려워, 머문 곳만 점으로 찍습니다.
 */
export default function VisitedPlacesScreen() {
  const styles = useStyles();
  const colors = useColors();
  const overlay = useMapOverlay();
  const mapIsDark = useMapIsDark();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ days?: string }>();
  const days = params.days === '30' ? 30 : 7;
  const { data: stats } = useJourneyStats(days);
  const { location } = useMyLocation();
  const unit = usePreferencesStore((s) => s.distanceUnit);
  const mapRef = useRef<AppMapViewHandle>(null);
  const spots = useMemo(() => stats?.spots ?? [], [stats]);

  useEffect(() => {
    if (spots.length === 1) mapRef.current?.moveTo(spots[0], 0.01);
    else if (spots.length > 1) mapRef.current?.fitTo(spots);
  }, [spots]);

  const markers = useMemo<MapMarkerItem[]>(() => {
    const most = Math.max(1, ...spots.map((s) => s.count));
    return spots.map((s, i) => {
      const size = 14 + Math.round((s.count / most) * 14);
      return {
        id: `spot-${i}`,
        coordinate: s,
        trackKey: `${size}`,
        children: <View style={[styles.dot, { width: size, height: size, borderRadius: size / 2, opacity: 0.55 + 0.45 * (s.count / most) }]} />,
      };
    });
  }, [spots, styles.dot]);

  return (
    <View style={styles.container}>
      <AppMapView ref={mapRef} initialCenter={spots[0] ?? location ?? FALLBACK} initialDelta={0.05} markers={markers} padding={{ top: 120, right: 30, bottom: 220, left: 30 }} />

      <StatusBar style={mapIsDark ? 'light' : 'dark'} />

      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <View style={styles.titleRow}>
          <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={26} color={overlay.text} />
          </Pressable>
          <AppText variant="title1" color={overlay.text} numberOfLines={1} style={styles.flex}>
            {t(days === 30 ? 'history.last30' : 'history.last7')}
          </AppText>
        </View>
      </SafeAreaView>

      <View style={styles.sheet}>
        <View style={styles.sheetBody}>
          <AppText variant="title2">{t('history.myPlaces')}</AppText>
          {stats ? (
            <View style={styles.summary}>
              <AppText variant="body2" style={styles.flex}>
                {t('history.totalDistance', { distance: formatDistance(stats.totalDistanceM, unit) })}
              </AppText>
              <AppText variant="body2" style={styles.flex}>
                {t('history.visited', { count: stats.stopCount })}
              </AppText>
            </View>
          ) : null}
          {stats && spots.length === 0 ? (
            <AppText variant="label1" color={colors.textMuted}>
              {t('history.noPlaces')}
            </AppText>
          ) : null}
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
  dot: { borderWidth: 3, borderColor: colors.white, backgroundColor: colors.routeMove },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.background },
  sheetBody: { paddingHorizontal: layout.screenPadding, paddingTop: 20, paddingBottom: 16, gap: 12 },
  summary: { flexDirection: 'row' },
}));
