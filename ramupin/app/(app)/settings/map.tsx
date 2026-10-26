import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, ChipTabs, Screen, SegmentButtons, ToggleRow } from '@/components/ui';
import { AppMapView } from '@/features/map/AppMapView';
import { isKoreanSystem } from '@/features/map/region';
import { PLAN_NAMES } from '@/features/policy/policies';
import { usePlan } from '@/features/policy/usePlan';
import { usePreferencesStore, type Preferences } from '@/stores/preferencesStore';
import { makeStyles, radius, useColors } from '@/theme';
import { showToast } from '@/utils/toast';

/**
 * 피그마: 지도 설정 (283:27132 / 무료 사용자 283:27009)
 * 기획: 유료 지도 옵션을 누르면 "0000 플랜부터 이용 가능"으로 선택 불가 (WBS 10.5~10.7)
 * TODO(8단계): 네이버·Mapbox·다크·3D·교통·날씨 실제 적용. 지금은 설정값만 저장
 */
export default function MapSettingsScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const prefs = usePreferencesStore();
  const { can, minPlanFor } = usePlan();

  const premiumMap = can('premiumMap');
  const koreanSystem = isKoreanSystem();

  const locked = (feature: 'premiumMap' | 'trafficWeather') =>
    showToast(t('mapSettings.premiumOnly', { plan: PLAN_NAMES[minPlanFor(feature)] }));

  const setProvider = (provider: Preferences['mapProvider']) => {
    if (provider !== 'os' && !premiumMap) {
      locked('premiumMap');
      return;
    }
    prefs.set({ mapProvider: provider });
  };

  return (
    <Screen title={t('screens.mapSettings')} tab="map" contentStyle={styles.content}>
      {/*
        앱 화면 색 (피그마 2026-09-28 다크 모드).
        지도 스타일과 다릅니다 — 이건 앱 전체의 배경·글자 색입니다.
        기본은 기기 설정을 따라가고, 원하면 직접 고를 수 있습니다.
      */}
      <View style={styles.section}>
        <AppText variant="title4">{t('mapSettings.appTheme')}</AppText>
        <AppText variant="label1" color={colors.textSecondary}>
          {t('mapSettings.appThemeDesc')}
        </AppText>
        <SegmentButtons
          value={prefs.appTheme}
          onChange={(appTheme) => prefs.set({ appTheme })}
          options={[
            { value: 'auto', label: t('mapSettings.themeAuto') },
            { value: 'light', label: t('mapSettings.light') },
            { value: 'dark', label: t('mapSettings.dark') },
          ]}
        />
      </View>

      <View style={styles.section}>
        <AppText variant="title4">{t('mapSettings.style')}</AppText>
        <View style={styles.preview}>
          {/* 설정에 따라 바뀌는 미리보기. 간단 모드(lite)에서는 지도가 비어 보여서 일반 모드로 띄웁니다 */}
          <AppMapView initialCenter={{ latitude: 37.5116, longitude: 127.0595 }} initialDelta={0.01} style={StyleSheet.absoluteFill} />
          <View style={[styles.overlay, styles.topRight]}>
            <ChipTabs
              tone="dark"
              value={prefs.mapTheme}
              onChange={(mapTheme) => prefs.set({ mapTheme })}
              options={[
                { value: 'light', label: t('mapSettings.light') },
                { value: 'dark', label: t('mapSettings.dark') },
              ]}
            />
          </View>
          <View style={[styles.overlay, styles.topLeft]}>
            <ChipTabs
              tone="dark"
              value={prefs.mapDimension}
              onChange={(mapDimension) => prefs.set({ mapDimension })}
              options={[
                { value: '3d', label: '3D' },
                { value: '2d', label: '2D' },
              ]}
            />
          </View>
        </View>

      </View>

      {/* 지도 제공 (보완 4.15): 기기 기본(모든 플랜) / 네이버(기기 언어가 한국어일 때만) / MapBox(유료) */}
      <View style={styles.section}>
        <AppText variant="title4">{t('mapSettings.provider')}</AppText>
        <ProviderOption
          selected={prefs.mapProvider === 'os'}
          title={t('mapSettings.os')}
          description={t('mapSettings.osDesc')}
          onPress={() => setProvider('os')}
        />
        {koreanSystem ? (
          <ProviderOption
            selected={prefs.mapProvider === 'naver'}
            title={t('mapSettings.naver')}
            description={t('mapSettings.naverDesc')}
            lockLabel={premiumMap ? undefined : PLAN_NAMES[minPlanFor('premiumMap')]}
            onPress={() => setProvider('naver')}
          />
        ) : null}
        <ProviderOption
          selected={prefs.mapProvider === 'mapbox'}
          title={t('mapSettings.mapboxPremium')}
          description={t('mapSettings.mapboxDesc')}
          lockLabel={premiumMap ? undefined : PLAN_NAMES[minPlanFor('premiumMap')]}
          onPress={() => setProvider('mapbox')}
        />
        <View style={styles.noteBox}>
          <AppText variant="caption" color={colors.textTertiary}>
            {t('mapSettings.naverNote')}
          </AppText>
        </View>
      </View>

      {/* 교통은 각 지도에 들어 있는 교통 정보라 따로 드는 비용이 없어 우선 누구나 켤 수 있게 둡니다.
          날씨는 지도에 늘 보여서 스위치를 뺐습니다. 기상청 키를 받으면 유료로 묶을지 다시 정합니다 (대표님 10-12) */}
      <ToggleRow
        title={t('mapSettings.traffic')}
        description={t('mapSettings.trafficDesc')}
        value={prefs.showTraffic}
        onValueChange={(showTraffic) => prefs.set({ showTraffic })}
      />
      <ToggleRow
        title={t('mapSettings.fitAll')}
        description={t('mapSettings.fitAllDesc')}
        value={prefs.fitAllFriends}
        onValueChange={(fitAllFriends) => prefs.set({ fitAllFriends })}
      />

      {/* 거리 단위는 언어·지역 설정으로 옮겼습니다 (보완 4.14·4.15) */}
      <Pressable accessibilityRole="button" onPress={() => router.push('/settings/language')} style={styles.noteBox}>
        <AppText variant="caption" color={colors.textTertiary}>
          {t('mapSettings.unitMoved')}
        </AppText>
      </Pressable>
    </Screen>
  );
}

/** 지도 제공 한 줄. 잠긴 지도는 "0000 플랜부터" 배지 */
function ProviderOption({
  selected,
  title,
  description,
  lockLabel,
  onPress,
}: {
  selected: boolean;
  title: string;
  description: string;
  lockLabel?: string;
  onPress: () => void;
}) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress} style={styles.option}>
      <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={22} color={selected ? colors.brown : colors.textMuted} />
      <View style={styles.flex}>
        <AppText variant="body2Bold">{title}</AppText>
        <AppText variant="caption" color={colors.textTertiary}>
          {description}
        </AppText>
      </View>
      {lockLabel ? (
        <View style={styles.lock}>
          <Ionicons name="lock-closed" size={12} color={colors.white} />
          <AppText variant="micro" color={colors.white}>
            {lockLabel}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.md, backgroundColor: colors.surface },
  lock: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full, backgroundColor: colors.sos },
  noteBox: { padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight },
  content: { gap: 16 },
  flex: { flex: 1 },
  section: { gap: 12 },
  preview: { height: 200, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surfaceStrong },
  overlay: { position: 'absolute' },
  topRight: { top: 12, right: 12 },
  // 피그마는 3D/2D 가 왼쪽 아래지만, 폰 폭에서는 지도 선택 칩과 겹쳐 왼쪽 위로 옮김
  topLeft: { top: 12, left: 12 },

}));
