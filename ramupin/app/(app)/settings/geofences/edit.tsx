import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, Popup, Switch, TextField } from '@/components/ui';
import { describePlace, searchPlace } from '@/features/location/address';
import { useAreaName } from '@/features/location/useAreaName';
import { useMyLocation } from '@/features/location/useMyLocation';
import { AppMapView, type AppMapViewHandle } from '@/features/map/AppMapView';
import { PlacePin } from '@/features/map/PlacePin';
import { RadiusSlider } from '@/features/geofence/RadiusSlider';
import { zoneDraft } from '@/features/geofence/zoneDraft';
import { distanceM } from '@/features/location/geo';
import { usePlan } from '@/features/policy/usePlan';
import { useGeofences, useSaveGeofence } from '@/features/settings/queries';
import { layout, makeStyles, radius, typography, useColors, useMapIsDark, useMapOverlay, withAlpha } from '@/theme';
import type { GeofenceKind, LatLng } from '@/types/models';
import { showToast } from '@/utils/toast';

const FALLBACK_CENTER: LatLng = { latitude: 37.4979, longitude: 127.0276 };
/** 반경 기본값 (보완 4.16 제안 300m). 100m ~ 1km, 50m 단위 */
const DEFAULT_RADIUS = 300;
const KINDS: GeofenceKind[] = ['home', 'work', 'school', 'hospital', 'other'];
const NAME_MAX = 10;
/** 아래 시트가 가리는 높이. 지도 가운데(핀)를 시트 위 빈 곳의 가운데로 맞춥니다 */
const SHEET_SPACE = 440;

/**
 * 피그마: 지오펜스 등록 (125:58756 / 이름 입력 125:58789 / 추가됨 125:58855)
 * 기획: 장소를 꾹 누르면 위치핀, 핀을 옮기면 주소가 바뀜, 검색 가능, 이름 입력 후 등록
 * 지도 중앙 고정 핀 방식으로 구현 (장소 선택 지도와 같은 조작)
 *
 * 보완 4.16 (피그마 v2.4 1015:55818): 반경 슬라이더 100m~1km, 종류(집·직장·학교·병원·기타), 겹치는 안심존 경고.
 * 알림을 켜면 [다음 · 알림 받을 사람] 으로 2단계(alerts.tsx, 4.17)에 갑니다.
 *
 * 10-26 대표님: 장소(즐겨찾기)와 안심존을 한 한도로. "드나들 때 알림" 을 켠 장소가 안심존이고
 * (geofenceAlertLimit 곳까지), 끈 장소는 즐겨찾기로만 저장됩니다.
 */
export default function GeofenceEditScreen() {
  const styles = useStyles();
  const colors = useColors();
  // 제목·뒤로가기가 지도 위에 바로 얹혀 있어, 앱 화면 색이 아니라 지도 밝기를 따라갑니다
  const overlay = useMapOverlay();
  const mapIsDark = useMapIsDark();
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { data: geofences = [] } = useGeofences();
  const existing = geofences.find((g) => g.id === id);
  const save = useSaveGeofence();
  const mapRef = useRef<AppMapViewHandle>(null);
  const { location } = useMyLocation();
  const { limit } = usePlan();
  const placeLimit = limit('placeLimit');
  // 알림을 켤 수 있는 장소 수. 0 이면 이 등급에서는 진입·이탈 알림을 쓸 수 없습니다 (서버도 같은 값으로 막습니다)
  const alertLimit = limit('geofenceAlertLimit');
  // 이 장소를 빼고 이미 알림을 켠 곳
  const otherAlerts = geofences.filter((g) => g.enabled && g.id !== id).length;
  const canAlert = otherAlerts < alertLimit;

  const [center, setCenter] = useState<LatLng | null>(existing?.center ?? null);
  const [address, setAddress] = useState('');
  const [name, setName] = useState(existing?.name ?? '');
  const [radiusM, setRadiusM] = useState(existing?.radiusM ?? DEFAULT_RADIUS);
  const [kind, setKind] = useState<GeofenceKind>(existing?.kind ?? 'home');
  const [query, setQuery] = useState('');
  const [added, setAdded] = useState<{ name: string; address: string } | null>(null);
  // 새 장소는 알림을 켤 자리가 남아 있으면 켠 채로 시작합니다
  const [alertOn, setAlertOn] = useState(existing ? existing.enabled : canAlert);
  // 목록이 늦게 와서 자리가 없다는 것을 나중에 알면 끕니다 (새 장소만)
  useEffect(() => {
    if (!existing && !canAlert) setAlertOn(false);
  }, [existing, canAlert]);
  const areaName = useAreaName(center);

  // 새로 등록할 때는 내 위치에서 시작
  const started = useRef(!!id);
  useEffect(() => {
    if (started.current || !location) return;
    started.current = true;
    mapRef.current?.moveTo(location, 0.004);
    setCenter(location);
  }, [location]);

  /**
   * 고칠 때는 저장된 자리로 한 번 옮깁니다.
   * 처음 카메라(initialCenter)만 두면 아래 시트만큼의 여백이 나중에 붙으면서 가운데가 여백 절반만큼 밀려,
   * 수정 화면을 열기만 해도 주소가 바뀌고 그대로 저장하면 안심존이 옮겨졌습니다 (10-13 폰에서 확인)
   */
  const placed = useRef(false);
  useEffect(() => {
    if (placed.current || !existing) return;
    placed.current = true;
    const target = existing.center;
    setCenter(target);
    // 목록을 다시 받아 existing 이 바뀌어도 취소되지 않게 정리 함수를 두지 않습니다 (화면을 떠나면 mapRef 가 비어 아무 일도 없음)
    setTimeout(() => mapRef.current?.moveTo(target, 0.004), 300);
  }, [existing]);

  useEffect(() => {
    if (!center) return;
    let cancelled = false;
    describePlace(center).then((p) => !cancelled && setAddress(p.address));
    return () => {
      cancelled = true;
    };
  }, [center]);

  const onSearch = async () => {
    Keyboard.dismiss();
    const found = query.trim() ? await searchPlace(query.trim()) : null;
    if (!found) {
      showToast(t('placePicker.notFound'));
      return;
    }
    mapRef.current?.moveTo(found, 0.004);
    setCenter(found);
  };

  const changeAlert = (on: boolean) => {
    if (on && !canAlert) {
      showToast(alertLimit === 0 ? t('geofence.alertNotAllowed') : t('geofence.alertLimitReached', { limit: alertLimit }));
      return;
    }
    setAlertOn(on);
  };

  const draft = () =>
    center
      ? {
          // 2단계에서 고칠 알림 대상·시간은 저장된 값(없으면 기본)을 그대로 넘깁니다
          ...existing,
          id: existing?.id,
          name: name.trim(),
          address,
          center,
          radiusM,
          kind,
          enabled: alertOn,
          recipientFriendIds: existing?.recipientFriendIds ?? [],
        }
      : null;

  /** 다른 안심존과 겹치면 알려 줍니다 (막지는 않음, 4.16 업무 규칙) */
  const warnOverlap = () => {
    if (!center) return;
    const overlap = geofences.find((g) => g.id !== id && g.enabled && distanceM(g.center, center) < g.radiusM + radiusM);
    if (overlap) showToast(t('geofence.overlap', { name: overlap.name }));
  };

  const onSave = () => {
    const next = draft();
    if (!next) return;
    warnOverlap();
    save.mutate(next, { onSuccess: () => setAdded({ name: next.name, address }) });
  };

  const onNext = () => {
    const next = draft();
    if (!next) return;
    warnOverlap();
    zoneDraft.set(next);
    router.push('/settings/geofences/alerts');
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AppMapView
        ref={mapRef}
        initialCenter={existing?.center ?? location ?? FALLBACK_CENTER}
        initialDelta={0.004}
        onCenterChange={setCenter}
        padding={{ top: 0, right: 0, bottom: SHEET_SPACE, left: 0 }}
        // 반경을 지도에 바로 보여 줍니다 (4.16 안심존 원형 범위)
        circles={center ? [{ id: 'draft', center, radiusM, fillColor: 'rgba(124,109,103,0.18)', strokeColor: 'rgba(124,109,103,0.6)' }] : []}
      />
      <View style={styles.pinWrap} pointerEvents="none">
        <View style={styles.pin}>
          <PlacePin label={name.trim() || t('geofence.name')} />
        </View>
      </View>

      <StatusBar style={mapIsDark ? 'light' : 'dark'} />

      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <View style={styles.titleRow}>
          <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8} style={styles.back}>
            <Ionicons name="chevron-back" size={26} color={overlay.text} />
          </Pressable>
          {/* 지도 글자 위에 겹치므로 지도 탭 지역명처럼 테두리 빛을 둡니다 */}
          <AppText
            variant="title1"
            color={overlay.text}
            numberOfLines={1}
            style={[styles.flex, { textShadowColor: mapIsDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 6 }]}
          >
            {areaName ?? ''}
          </AppText>
        </View>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={colors.textTertiary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={onSearch}
            placeholder={t('placePicker.search')}
            placeholderTextColor={colors.textTertiary}
            returnKeyType="search"
            style={styles.searchInput}
          />
        </View>
      </SafeAreaView>

      <SafeAreaView edges={['bottom']} style={styles.sheet}>
        <View style={styles.grabber} />
        <View style={styles.addressBlock}>
          <AppText variant="title4">{t('geofence.address')}</AppText>
          <AppText variant="label1">{address || t('placePicker.finding')}</AppText>
        </View>
        <TextField
          label={t('geofence.name')}
          placeholder={t('geofence.namePlaceholder')}
          value={name}
          onChangeText={setName}
          maxLength={NAME_MAX}
          showCount
        />
        <View style={styles.kindRow}>
          {KINDS.map((k) => (
            <Pressable key={k} accessibilityRole="radio" accessibilityState={{ selected: kind === k }} onPress={() => setKind(k)} style={[styles.kindChip, kind === k && styles.kindChipOn]}>
              <AppText variant="label2" color={kind === k ? colors.white : colors.textSecondary}>
                {t(`geofence.kind.${k}`)}
              </AppText>
            </Pressable>
          ))}
        </View>
        <View>
          <View style={styles.radiusRow}>
            <AppText variant="label1" color={colors.textSecondary} style={styles.flex}>
              {t('geofence.radius')}
            </AppText>
            <AppText variant="label1Bold">{radiusM >= 1000 ? `${radiusM / 1000}km` : `${radiusM}m`}</AppText>
          </View>
          <RadiusSlider value={radiusM} onChange={setRadiusM} />
        </View>
        <View style={styles.radiusRow}>
          <View style={styles.flex}>
            <AppText variant="label1" color={colors.textSecondary}>
              {t('geofence.alertToggle')}
            </AppText>
            <AppText variant="caption" color={colors.textTertiary}>
              {t(alertOn ? 'geofence.alertToggleOn' : 'geofence.alertToggleOff')}
            </AppText>
          </View>
          <Switch value={alertOn} onValueChange={changeAlert} accessibilityLabel={t('geofence.alertToggle')} />
        </View>
        {!existing ? (
          <AppText variant="caption" color={colors.textTertiary} align="center">
            {t('geofence.remainingShort', { remaining: Math.max(0, placeLimit - geofences.length) })}
          </AppText>
        ) : null}
        <Button
          label={alertOn ? t('geofence.next') : t(existing ? 'geofence.save' : 'geofence.register')}
          variant="brownLight"
          size="lg"
          disabled={!name.trim() || !address || save.isPending}
          onPress={alertOn ? onNext : onSave}
        />
      </SafeAreaView>

      <Popup
        visible={!!added}
        title={t('geofence.addedTitle', { name: added?.name })}
        message={t('geofence.addedMessage', { name: added?.name, address: added?.address })}
        confirmLabel={t('common.confirm')}
        onConfirm={() => {
          setAdded(null);
          router.back();
        }}
      />
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: '#ECEAE4' },
  flex: { flex: 1 },
  pinWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', paddingBottom: SHEET_SPACE },
  // 핀 끝이 좌표를 가리키도록 핀 높이만큼 위로
  pin: { marginBottom: 64 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: layout.screenPadding, gap: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 12 },
  back: { marginLeft: -8 },
  searchBar: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    backgroundColor: withAlpha(colors.background, 0.92),
  },
  searchInput: { flex: 1, ...typography.label1, color: colors.text, paddingVertical: 0 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: 16,
    gap: 14,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: colors.surface,
  },
  grabber: { alignSelf: 'center', width: 58, height: 4, borderRadius: 2, backgroundColor: '#B9B9B9', marginTop: 12 },
  addressBlock: { gap: 6 },
  radiusRow: { flexDirection: 'row', alignItems: 'center' },
  kindRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  kindChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.full, backgroundColor: colors.surfaceStrong },
  kindChipOn: { backgroundColor: colors.brown },
}));
