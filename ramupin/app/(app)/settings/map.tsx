import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, ChipTabs, Screen, ToggleRow } from '@/components/ui';
import { AppMapView } from '@/features/map/AppMapView';
import { PLAN_NAMES } from '@/features/policy/policies';
import { usePlan } from '@/features/policy/usePlan';
import { usePreferencesStore, type Preferences } from '@/stores/preferencesStore';
import { colors, radius } from '@/theme';
import { showToast } from '@/utils/toast';

/**
 * 피그마: 지도 설정 (283:27132 / 무료 사용자 283:27009)
 * 기획: 유료 지도 옵션을 누르면 "0000 플랜부터 이용 가능"으로 선택 불가 (WBS 10.5~10.7)
 * TODO(8단계): 네이버·Mapbox·다크·3D·교통·날씨 실제 적용. 지금은 설정값만 저장
 */
export default function MapSettingsScreen() {
  const { t } = useTranslation();
  const prefs = usePreferencesStore();
  const { can, minPlanFor } = usePlan();

  const premiumMap = can('premiumMap');
  const trafficWeather = can('trafficWeather');
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

        {/* 지도 제공사는 폭이 넓어 미리보기 아래에 따로 (피그마는 지도 위, 폰 폭에서는 겹침) */}
        <View style={styles.providerRow}>
          <ChipTabs
            tone="dark"
            value={prefs.mapProvider}
            onChange={setProvider}
            options={[
              { value: 'os', label: t('mapSettings.os') },
              { value: 'naver', label: t('mapSettings.naver') },
              { value: 'mapbox', label: t('mapSettings.mapbox') },
            ]}
          />
        </View>
        {!premiumMap ? (
          <AppText variant="label2" color={colors.primary}>
            {t('mapSettings.premiumOnly', { plan: PLAN_NAMES[minPlanFor('premiumMap')] })}
          </AppText>
        ) : null}
      </View>

      <ToggleRow
        title={t('mapSettings.traffic')}
        description={t('mapSettings.trafficDesc')}
        value={trafficWeather && prefs.showTraffic}
        onValueChange={(v) => (trafficWeather ? prefs.set({ showTraffic: v }) : locked('trafficWeather'))}
      />
      <ToggleRow
        title={t('mapSettings.weather')}
        description={t('mapSettings.weatherDesc')}
        value={trafficWeather && prefs.showWeather}
        onValueChange={(v) => (trafficWeather ? prefs.set({ showWeather: v }) : locked('trafficWeather'))}
      />
      <ToggleRow
        title={t('mapSettings.fitAll')}
        description={t('mapSettings.fitAllDesc')}
        value={prefs.fitAllFriends}
        onValueChange={(fitAllFriends) => prefs.set({ fitAllFriends })}
      />

      <View style={styles.unitRow}>
        <View style={styles.flex}>
          <AppText variant="headline">{t('mapSettings.unit')}</AppText>
          <AppText variant="label2" color={colors.textSecondary}>
            {t('mapSettings.unitDesc')}
          </AppText>
        </View>
        <View style={styles.unitChips}>
          <ChipTabs
            tone="dark"
            value={prefs.distanceUnit}
            onChange={(distanceUnit) => prefs.set({ distanceUnit })}
            options={[
              { value: 'km', label: 'Km' },
              { value: 'mile', label: 'Mile' },
            ]}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  flex: { flex: 1 },
  section: { gap: 12 },
  preview: { height: 200, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surfaceStrong },
  overlay: { position: 'absolute' },
  topRight: { top: 12, right: 12 },
  // 피그마는 3D/2D 가 왼쪽 아래지만, 폰 폭에서는 지도 선택 칩과 겹쳐 왼쪽 위로 옮김
  topLeft: { top: 12, left: 12 },
  providerRow: { alignSelf: 'flex-start', backgroundColor: colors.surfaceStrong, borderRadius: radius.full },
  unitRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  unitChips: { backgroundColor: colors.surfaceStrong, borderRadius: radius.full },
});
