import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppText, MenuItem, Screen } from '@/components/ui';
import { describePlace } from '@/features/location/address';
import { ProfileCard } from '@/features/settings/ProfileCard';
import { colors, radius } from '@/theme';

interface LocationInfo {
  address: string;
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number | null;
  timestamp: number;
}

/** 피그마: 나의 프로필 (283:25210) / 내 위치 정보 펼침 (283:25320) */
export default function MyProfileScreen() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<LocationInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleLocation = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setError(null);
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) {
      setError(t('myProfile.noPermission'));
      return;
    }
    const { coords, timestamp } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const place = await describePlace({ latitude: coords.latitude, longitude: coords.longitude });
    setInfo({ address: place.address, latitude: coords.latitude, longitude: coords.longitude, altitude: coords.altitude, accuracy: coords.accuracy, timestamp });
  };

  return (
    <Screen
      title={t('screens.myProfile')}
      tab="map"
      contentStyle={styles.content}
      headerRight={
        <Pressable accessibilityRole="button" accessibilityLabel={t('myProfile.settings')} hitSlop={8} onPress={() => router.push('/settings/menu')}>
          <Ionicons name="settings-outline" size={24} color={colors.text} />
        </Pressable>
      }
    >
      <ProfileCard onPress={() => router.push('/settings/profile-edit')} />
      <MenuItem label={t('myProfile.settings')} onPress={() => router.push('/settings/menu')} />
      <MenuItem label={t('myProfile.history')} onPress={() => router.push('/settings/history')} />

      {open ? (
        <View style={styles.locationCard}>
          <View style={styles.locationHeader}>
            <AppText variant="headline">{t('myProfile.myLocation')}</AppText>
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={toggleLocation} hitSlop={8}>
              <Ionicons name="close-circle-outline" size={26} color={colors.textSecondary} />
            </Pressable>
          </View>
          {error ? (
            <AppText variant="label1" color={colors.danger}>
              {error}
            </AppText>
          ) : !info ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.brown} />
              <AppText variant="label1" color={colors.textTertiary}>
                {t('myProfile.locating')}
              </AppText>
            </View>
          ) : (
            <>
              <AppText variant="body2" color={colors.textTertiary}>
                {new Date(info.timestamp).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
              </AppText>
              {[
                t('myProfile.currentLocation', { address: info.address }),
                t('myProfile.coordinates', { lat: info.latitude.toFixed(4), lng: info.longitude.toFixed(4) }),
                info.altitude != null ? t('myProfile.altitude', { altitude: info.altitude.toFixed(1) }) : null,
                info.accuracy != null ? t('myProfile.accuracy', { accuracy: Math.round(info.accuracy) }) : null,
                t('myProfile.measuredAt', { time: new Date(info.timestamp).toLocaleTimeString('ko-KR') }),
              ]
                .filter(Boolean)
                .map((line) => (
                  <View key={line} style={styles.bullet}>
                    <AppText variant="body2">•</AppText>
                    <AppText variant="body2" style={styles.flex}>
                      {line}
                    </AppText>
                  </View>
                ))}
            </>
          )}
        </View>
      ) : (
        <MenuItem label={t('myProfile.myLocation')} onPress={toggleLocation} />
      )}

      <MenuItem label={t('myProfile.hideMode')} onPress={() => router.push('/settings/hide-mode')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 8 },
  flex: { flex: 1 },
  locationCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.surfaceStrong,
    backgroundColor: colors.surface,
    padding: 12,
    gap: 6,
  },
  locationHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  bullet: { flexDirection: 'row', gap: 8, paddingLeft: 8 },
});
