import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui';
import { StreetViewWeb } from '@/features/map/StreetViewWeb';
import { colors, radius } from '@/theme';
import { showToast } from '@/utils/toast';

/**
 * 로드뷰(거리뷰) 화면 (WBS 10.5 유료 지도).
 * 지도/친구 위치에서 열고, 로드뷰가 없는 곳이면 네이버 지도 앱으로 넘길 수 있습니다.
 */
export default function StreetViewScreen() {
  const { t } = useTranslation();
  const { lat, lng, name } = useLocalSearchParams<{ lat: string; lng: string; name?: string }>();
  const coordinate = { latitude: Number(lat), longitude: Number(lng) };
  const valid = Number.isFinite(coordinate.latitude) && Number.isFinite(coordinate.longitude);

  const openNaverApp = async () => {
    const url = `nmap://panorama?lat=${coordinate.latitude}&lng=${coordinate.longitude}&appname=com.ramuviamanager.ramupin`;
    if (await Linking.canOpenURL(url)) {
      Linking.openURL(url);
      return;
    }
    // 네이버 지도 앱이 없으면 웹 지도로
    Linking.openURL(`https://map.naver.com/p/?c=${coordinate.longitude},${coordinate.latitude},17,0,0,0,dh`).catch(() =>
      showToast(t('streetView.openFailed')),
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {valid ? <StreetViewWeb coordinate={coordinate} /> : null}

      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <View style={styles.topRow} pointerEvents="box-none">
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => router.back()} style={styles.roundButton}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          {name ? (
            <View style={styles.titlePill}>
              <AppText variant="headline" color={colors.text} numberOfLines={1}>
                {name}
              </AppText>
            </View>
          ) : null}
        </View>
      </SafeAreaView>

      <SafeAreaView edges={['bottom']} style={styles.bottom} pointerEvents="box-none">
        <Pressable accessibilityRole="button" onPress={openNaverApp} style={styles.openButton}>
          <Ionicons name="open-outline" size={18} color={colors.text} />
          <AppText variant="headline" color={colors.text}>
            {t('streetView.openInNaver')}
          </AppText>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black },
  top: { position: 'absolute', top: 0, left: 0, right: 0 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16 },
  roundButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  titlePill: { flexShrink: 1, paddingHorizontal: 14, height: 40, justifyContent: 'center', borderRadius: radius.full, backgroundColor: colors.white },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center' },
  openButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    margin: 20,
    paddingHorizontal: 16,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.white,
  },
});
