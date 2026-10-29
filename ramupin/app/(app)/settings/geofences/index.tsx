import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, BottomNav, Button, Header, Popup } from '@/components/ui';
import { AppMapView, type AppMapViewHandle, type MapCircleItem, type MapMarkerItem } from '@/features/map/AppMapView';
import { PlacePin } from '@/features/map/PlacePin';
import { zoneDraft } from '@/features/geofence/zoneDraft';
import { usePlan } from '@/features/policy/usePlan';
import { useGeofences, useRemoveGeofence, useSaveGeofence } from '@/features/settings/queries';
import { layout, makeStyles, radius, useColors, withAlpha } from '@/theme';
import type { Geofence } from '@/types/models';
import { showToast } from '@/utils/toast';

const FALLBACK_CENTER = { latitude: 37.4979, longitude: 127.0276 };
const SHEET_HEIGHT = 440;
/** 내린 패널 높이: 손잡이 + 등록 개수 + 하단 탭 */
const COLLAPSED_HEIGHT = 150;

/**
 * 피그마: 지오펜스 설정 (125:56753) / 메뉴 (125:56811) / 삭제 확인 (125:56812)
 * 기획: 점 세 개 → 활성화·비활성화 / 수정하기 / 삭제, 수정하기에서 위치와 이름 변경
 *
 * 10-26 대표님: 장소(즐겨찾기)와 지오펜스 한도 통합. 장소는 placeLimit 까지 저장하고,
 * 그중 드나들 때 알림을 켠 곳(=안심존)은 geofenceAlertLimit 까지입니다. 알림을 끈 장소는 즐겨찾기로 남습니다.
 */
export default function GeofencesScreen() {
  const styles = useStyles();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const mapRef = useRef<AppMapViewHandle>(null);
  const { data: geofences = [], isFetched } = useGeofences();
  const save = useSaveGeofence();
  const remove = useRemoveGeofence();
  const { limit, policy } = usePlan();
  const [menuId, setMenuId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Geofence | null>(null);
  /** 대표 리포트 19: 아래 패널을 내려 지도를 넓게 볼 수 있게 */
  const [collapsed, setCollapsed] = useState(false);

  // 등록된 안심존이 모두 보이게 한 번 맞춤
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || geofences.length === 0) return;
    fitted.current = true;
    if (geofences.length === 1) mapRef.current?.moveTo(geofences[0].center, 0.01);
    else mapRef.current?.fitTo(geofences.map((g) => g.center));
  }, [geofences]);

  // 대표 리포트 19: 추가하고 돌아오면 새 안심존으로 지도를 옮기고 패널을 내립니다
  const knownIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    // 처음 불러온 목록은 "새로 추가" 가 아닙니다
    if (!isFetched) return;
    const known = knownIds.current;
    knownIds.current = new Set(geofences.map((g) => g.id));
    if (!known) return;
    const added = geofences.find((g) => !known.has(g.id));
    if (!added) return;
    setCollapsed(true);
    mapRef.current?.moveTo(added.center, 0.01);
  }, [geofences, isFetched]);

  const focusZone = (g: Geofence) => {
    setCollapsed(true);
    mapRef.current?.moveTo(g.center, 0.01);
  };

  // 대표 리포트 76: 정책을 못 받았을 때 0개로 보여 "0개 중 0개 남음" 이 되고 추가가 막혔습니다.
  // 받기 전에는 '-' 로 보이고 추가는 막지 않습니다 (한도는 서버가 다시 확인합니다)
  const policyLoaded = !!policy;
  const placeLimit = limit('placeLimit');
  const remaining = Math.max(0, placeLimit - geofences.length);
  const alertLimit = limit('geofenceAlertLimit');
  const alertCount = geofences.filter((g) => g.enabled).length;

  const toggleAlert = (g: Geofence) => {
    if (!g.enabled && alertCount >= alertLimit) {
      showToast(alertLimit === 0 ? t('geofence.alertNotAllowed') : t('geofence.alertLimitReached', { limit: alertLimit }));
      return;
    }
    save.mutate({ ...g, enabled: !g.enabled });
  };

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
    if (policyLoaded && remaining <= 0) {
      showToast(t('geofence.limitReachedUpgrade', { limit: placeLimit }));
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
        padding={{ top: 120, right: 0, bottom: collapsed ? COLLAPSED_HEIGHT : SHEET_HEIGHT, left: 0 }}
      />

      <View style={styles.top} pointerEvents="box-none">
        {/* 머리글 바탕이 시계·배터리 자리까지 덮어야 합니다. 안 그러면 그 줄만 지도가 비쳐
            흰 글자가 밝은 지도 위에 놓입니다 */}
        <View style={[styles.headerBg, { paddingTop: insets.top }]}>
          <Header title={t('screens.geofences')} />
        </View>
        <View style={styles.remaining}>
          <AppText variant="label1" color={colors.textSecondary}>
            {policyLoaded
              ? `${t('geofence.usage', { limit: placeLimit, used: geofences.length })} · ${t('geofence.alertCount', { count: alertCount, limit: alertLimit })}`
              : t('geofence.usage', { limit: '-', used: geofences.length })}
          </AppText>
        </View>
      </View>

      <View style={[styles.sheet, collapsed && styles.sheetCollapsed]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(collapsed ? 'geofence.expandPanel' : 'geofence.collapsePanel')}
          onPress={() => setCollapsed(!collapsed)}
          hitSlop={12}
          style={styles.grabberHit}
        >
          <View style={styles.grabber} />
        </Pressable>
        <Pressable style={[styles.countBar, collapsed && styles.countBarCollapsed]} onPress={() => setCollapsed(!collapsed)}>
          <AppText variant="label1Bold" color={colors.white}>
            {t('geofence.registered', { count: geofences.length })}
          </AppText>
        </Pressable>
        {collapsed ? null : (
        <>
        <ScrollView contentContainerStyle={styles.list}>
          {geofences.length === 0 ? (
            <AppText variant="label1" color={colors.textMuted} align="center">
              {t('geofence.empty')}
            </AppText>
          ) : null}
          {geofences.map((g) => (
            <View key={g.id} style={styles.item}>
              <View style={styles.itemTitle}>
                <Pressable onPress={() => focusZone(g)} style={styles.flex}>
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
                      toggleAlert(g);
                    }}
                  />
                  {g.enabled ? (
                    <MenuAction
                      label={t('geofence.alertSettings')}
                      onPress={() => {
                        // 기존 안심존 › 더보기 › 알림 설정 (보완 4.17)
                        setMenuId(null);
                        zoneDraft.set(g);
                        router.push('/settings/geofences/alerts');
                      }}
                    />
                  ) : null}
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
        </>
        )}
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
  const styles = useStyles();
  const colors = useColors();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.menuItem}>
      <AppText variant="label1" color={danger ? colors.danger : colors.text}>
        {label}
      </AppText>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: '#ECEAE4' },
  flex: { flex: 1 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, gap: 8 },
  // 지도 위지만 화면 머리글이라 테마 색을 씁니다 (지도가 비쳐 보이게 반투명)
  headerBg: { backgroundColor: withAlpha(colors.background, 0.92) },
  remaining: {
    marginHorizontal: layout.screenPadding,
    height: 32,
    borderRadius: radius.xs,
    backgroundColor: withAlpha(colors.background, 0.95),
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
  sheetCollapsed: { height: undefined },
  grabberHit: { alignSelf: 'stretch', alignItems: 'center' },
  grabber: { width: 58, height: 4, borderRadius: 2, backgroundColor: '#B9B9B9', marginVertical: 12 },
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
    backgroundColor: colors.card,
    paddingVertical: 4,
    elevation: 6,
    shadowColor: colors.black,
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  menuItem: { paddingHorizontal: 20, paddingVertical: 10 },
  addWrap: { paddingHorizontal: 16, paddingBottom: 8 },
  // 내린 상태에서 등록 개수와 하단 탭 사이 간격
  countBarCollapsed: { marginBottom: 12 },
}));
