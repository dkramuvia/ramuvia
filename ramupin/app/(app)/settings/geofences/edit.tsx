import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, ChipTabs, Popup, TextField } from '@/components/ui';
import { describePlace, searchPlace } from '@/features/location/address';
import { useAreaName } from '@/features/location/useAreaName';
import { useMyLocation } from '@/features/location/useMyLocation';
import { AppMapView, type AppMapViewHandle } from '@/features/map/AppMapView';
import { PlacePin } from '@/features/map/PlacePin';
import { useGeofences, useSaveGeofence } from '@/features/settings/queries';
import { colors, layout, radius, typography } from '@/theme';
import type { LatLng } from '@/types/models';
import { showToast } from '@/utils/toast';

const FALLBACK_CENTER: LatLng = { latitude: 37.4979, longitude: 127.0276 };
// TODO(정책): 반경 선택지·기본값은 서버 정책값 (WBS 4.7 기본 100m, 변경 가능)
const RADII = ['100', '200', '500'] as const;
const NAME_MAX = 10;

/**
 * 피그마: 지오펜스 등록 (125:58756 / 이름 입력 125:58789 / 추가됨 125:58855)
 * 기획: 장소를 꾹 누르면 위치핀, 핀을 옮기면 주소가 바뀜, 검색 가능, 이름 입력 후 등록
 * 지도 중앙 고정 핀 방식으로 구현 (장소 선택 지도와 같은 조작)
 */
export default function GeofenceEditScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { data: geofences = [] } = useGeofences();
  const existing = geofences.find((g) => g.id === id);
  const save = useSaveGeofence();
  const mapRef = useRef<AppMapViewHandle>(null);
  const { location } = useMyLocation();

  const [center, setCenter] = useState<LatLng | null>(existing?.center ?? null);
  const [address, setAddress] = useState('');
  const [name, setName] = useState(existing?.name ?? '');
  const [radiusM, setRadiusM] = useState<(typeof RADII)[number]>(String(existing?.radiusM ?? 100) as (typeof RADII)[number]);
  const [query, setQuery] = useState('');
  const [added, setAdded] = useState<{ name: string; address: string } | null>(null);
  const areaName = useAreaName(center);

  // 새로 등록할 때는 내 위치에서 시작
  const started = useRef(!!existing);
  useEffect(() => {
    if (started.current || !location) return;
    started.current = true;
    mapRef.current?.moveTo(location, 0.004);
    setCenter(location);
  }, [location]);

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

  const onSave = () => {
    if (!center) return;
    save.mutate(
      { id: existing?.id, name: name.trim(), address, center, radiusM: Number(radiusM), enabled: existing?.enabled ?? true },
      { onSuccess: () => setAdded({ name: name.trim(), address }) },
    );
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AppMapView
        ref={mapRef}
        initialCenter={existing?.center ?? location ?? FALLBACK_CENTER}
        initialDelta={0.004}
        onCenterChange={setCenter}
        padding={{ top: 0, right: 0, bottom: 320, left: 0 }}
      />
      <View style={styles.pinWrap} pointerEvents="none">
        <View style={styles.pin}>
          <PlacePin label={name.trim() || t('geofence.name')} />
        </View>
      </View>

      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <View style={styles.titleRow}>
          <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8} style={styles.back}>
            <Ionicons name="chevron-back" size={26} color={colors.textStrong} />
          </Pressable>
          <AppText variant="title1" color={colors.textStrong} numberOfLines={1} style={styles.flex}>
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
        <View style={styles.radiusRow}>
          <AppText variant="label1" color={colors.textSecondary} style={styles.flex}>
            {t('geofence.radius')}
          </AppText>
          <View style={styles.radiusChips}>
            <ChipTabs tone="dark" value={radiusM} onChange={setRadiusM} options={RADII.map((r) => ({ value: r, label: `${r}m` }))} />
          </View>
        </View>
        <Button
          label={t(existing ? 'geofence.save' : 'geofence.register')}
          variant="brownLight"
          size="lg"
          disabled={!name.trim() || !address || save.isPending}
          onPress={onSave}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ECEAE4' },
  flex: { flex: 1 },
  pinWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', paddingBottom: 320 },
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
    backgroundColor: 'rgba(247,247,248,0.92)',
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
    backgroundColor: '#F1F2F3',
  },
  grabber: { alignSelf: 'center', width: 58, height: 4, borderRadius: 2, backgroundColor: '#B9B9B9', marginTop: 12 },
  addressBlock: { gap: 6 },
  radiusRow: { flexDirection: 'row', alignItems: 'center' },
  radiusChips: { backgroundColor: colors.surfaceStrong, borderRadius: radius.full },
});
