import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, BottomNav, Button, Header, Popup } from '@/components/ui';
import { AppMapView, type AppMapViewHandle, type MapCircleItem, type MapMarkerItem } from '@/features/map/AppMapView';
import { PlacePin } from '@/features/map/PlacePin';
import { usePlan } from '@/features/policy/usePlan';
import { useGeofences, useRemoveGeofence, useSaveGeofence } from '@/features/settings/queries';
import { colors, layout, radius } from '@/theme';
import type { Geofence } from '@/types/models';
import { showToast } from '@/utils/toast';

const FALLBACK_CENTER = { latitude: 37.4979, longitude: 127.0276 };
const SHEET_HEIGHT = 440;

/**
 * 피그마: 지오펜스 설정 (125:56753) / 메뉴 (125:56811) / 삭제 확인 (125:56812)
 * 기획: 점 세 개 → 활성화·비활성화 / 수정하기 / 삭제, 수정하기에서 위치와 이름 변경
 */
export default function GeofencesScreen() {
  const { t } = useTranslation();
  const mapRef = useRef<AppMapViewHandle>(null);
  const { data: geofences = [] } = useGeofences();
  const save = useSaveGeofence();
  const remove = useRemoveGeofence();
  const { limit } = usePlan();
  const [menuId, setMenuId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Geofence | null>(null);

  // 등록된 안심존이 모두 보이게 한 번 맞춤
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || geofences.length === 0) return;
    fitted.current = true;
    if (geofences.length === 1) mapRef.current?.moveTo(geofences[0].center, 0.01);
    else mapRef.current?.fitTo(geofences.map((g) => g.center));
  }, [geofences]);

  const zoneLimit = limit('safeZoneLimit');
  const remaining = Math.max(0, zoneLimit - geofences.length);

  const markers = useMemo<MapMarkerItem[]>(
    () =>
      geofences.map((g) => ({
        id: g.id,
        coordinate: g.center,
        children: <PlacePin label={g.name} disabled={!g.enabled} />,
        onPress: () => router.push({ pathname: '/settings/geofences/edit', params: { id: g.id } }),
      })),
    [geofences],
  );
  const circles = useMemo<MapCircleItem[]>(
    () =>
      geofences
        .filter((g) => g.enabled)
        .map((g) => ({ id: g.id, center: g.center, radiusM: g.radiusM, fillColor: 'rgba(124,109,103,0.18)', strokeColor: 'rgba(124,109,103,0.6)' })),
    [geofences],
  );

  const add = () => {
    if (remaining <= 0) {
      showToast(t('geofence.limitReached'));
      return;
    }
    router.push('/settings/geofences/edit');
  };

  return (
    <View style={styles.container}>
      <AppMapView
        ref={mapRef}
        initialCenter={geofences[0]?.center ?? FALLBACK_CENTER}
        initialDelta={0.3}
        markers={markers}
        circles={circles}
        padding={{ top: 120, right: 0, bottom: SHEET_HEIGHT, left: 0 }}
      />

      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <View style={styles.headerBg}>
          <Header title={t('screens.geofences')} />
        </View>
        <View style={styles.remaining}>
          <AppText variant="label1" color={colors.textSecondary}>
            {t('geofence.remaining', { limit: zoneLimit, remaining })}
          </AppText>
        </View>
      </SafeAreaView>

      <View style={styles.sheet}>
        <View style={styles.grabber} />
        <View style={styles.countBar}>
          <AppText variant="label1Bold" color={colors.white}>
            {t('geofence.registered', { count: geofences.length })}
          </AppText>
        </View>
        <ScrollView contentContainerStyle={styles.list}>
          {geofences.length === 0 ? (
            <AppText variant="label1" color={colors.textMuted} align="center">
              {t('geofence.empty')}
            </AppText>
          ) : null}
          {geofences.map((g) => (
            <View key={g.id} style={styles.item}>
              <View style={styles.itemTitle}>
                <Pressable onPress={() => mapRef.current?.moveTo(g.center, 0.01)} style={styles.flex}>
                  <AppText variant="body2Bold" color={g.enabled ? colors.text : colors.textMuted}>
                    {g.name}
                    {g.enabled ? '' : ` · ${t('geofence.disabled')}`}
                  </AppText>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="메뉴" hitSlop={10} onPress={() => setMenuId(menuId === g.id ? null : g.id)}>
                  <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
                </Pressable>
              </View>
              <View style={styles.addressBox}>
                <AppText variant="label1" color={colors.textSecondary} numberOfLines={1}>
                  {g.address}
                </AppText>
              </View>
              {menuId === g.id ? (
                <View style={styles.menu}>
                  <MenuAction
                    label={t(g.enabled ? 'geofence.disable' : 'geofence.enable')}
                    onPress={() => {
                      setMenuId(null);
                      save.mutate({ ...g, enabled: !g.enabled });
                    }}
                  />
                  <MenuAction
                    label={t('geofence.edit')}
                    onPress={() => {
                      setMenuId(null);
                      router.push({ pathname: '/settings/geofences/edit', params: { id: g.id } });
                    }}
                  />
                  <MenuAction
                    label={t('geofence.delete')}
                    danger
                    onPress={() => {
                      setMenuId(null);
                      setDeleting(g);
                    }}
                  />
                </View>
              ) : null}
            </View>
          ))}
        </ScrollView>
        <View style={styles.addWrap}>
          <Button label={t('geofence.add')} variant="brownLight" size="lg" onPress={add} />
        </View>
        <BottomNav active="map" />
      </View>

      <Popup
        visible={!!deleting}
        title={t('geofence.deleteTitle', { name: deleting?.name })}
        message={t('geofence.deleteMessage')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setDeleting(null)}
        onDismiss={() => setDeleting(null)}
        confirmLabel={t('geofence.delete')}
        onConfirm={() => deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
      />
    </View>
  );
}

function MenuAction({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.menuItem}>
      <AppText variant="label1" color={danger ? colors.danger : colors.text}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ECEAE4' },
  flex: { flex: 1 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, gap: 8 },
  headerBg: { backgroundColor: 'rgba(247,247,248,0.92)' },
  remaining: {
    marginHorizontal: layout.screenPadding,
    height: 32,
    borderRadius: radius.xs,
    backgroundColor: 'rgba(247,247,248,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SHEET_HEIGHT,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.background,
  },
  grabber: { alignSelf: 'center', width: 58, height: 4, borderRadius: 2, backgroundColor: '#B9B9B9', marginVertical: 12 },
  countBar: {
    marginHorizontal: 24,
    height: 32,
    borderRadius: radius.xs,
    backgroundColor: colors.brown,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { paddingHorizontal: layout.screenPadding, paddingVertical: 16, gap: 20 },
  item: { gap: 8 },
  itemTitle: { flexDirection: 'row', alignItems: 'center' },
  addressBox: { borderRadius: radius.xs, backgroundColor: colors.surfaceStrong, paddingHorizontal: 12, paddingVertical: 8 },
  menu: {
    position: 'absolute',
    right: 0,
    top: 28,
    zIndex: 10,
    borderRadius: 8,
    backgroundColor: colors.white,
    paddingVertical: 4,
    elevation: 6,
    shadowColor: colors.black,
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  menuItem: { paddingHorizontal: 20, paddingVertical: 10 },
  addWrap: { paddingHorizontal: 16, paddingBottom: 8 },
});
