import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router, type Href } from 'expo-router';
import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Pressable, View, type ImageSourcePropType } from 'react-native';

import { AppText, Screen } from '@/components/ui';
import { describePlace } from '@/features/location/address';
import { ProfileCard } from '@/features/settings/ProfileCard';
import { makeStyles, radius, useColors } from '@/theme';
import { formatDate, formatTimeOfDay } from '@/utils/time';

interface LocationInfo {
  address: string;
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number | null;
  timestamp: number;
}

const ICONS = {
  locationInfo: require('../../../assets/icons/settings/location-info.png'),
  hideMode: require('../../../assets/icons/settings/hide-mode.png'),
  notifications: require('../../../assets/icons/settings/notifications.png'),
  safeZone: require('../../../assets/icons/settings/safezone.png'),
  locationCollect: require('../../../assets/icons/settings/location-collect.png'),
  safetySos: require('../../../assets/icons/settings/safety-sos.png'),
  scheduledMessage: require('../../../assets/icons/settings/scheduled-message.png'),
  friends: require('../../../assets/icons/settings/friends.png'),
  group: require('../../../assets/icons/settings/group.png'),
  premium: require('../../../assets/icons/settings/premium.png'),
  map: require('../../../assets/icons/settings/map.png'),
  language: require('../../../assets/icons/settings/language.png'),
  document: require('../../../assets/icons/settings/document.png'),
} satisfies Record<string, ImageSourcePropType>;

/** 'myLocation' 은 화면을 옮기지 않고 이 자리에서 내 위치 카드를 펼칩니다 */
type Entry = { key: string; icon: ImageSourcePropType; href: Href | 'myLocation'; danger?: boolean };

/**
 * 피그마 v2.6 나의 프로필 (7023:54135, 펼침 7045:54673).
 * 예전에는 나의 프로필 → 설정을 한 번 더 눌러 들어갔는데, v2.6 에서 앱 메뉴 구조 그대로 한 화면에 펼쳤습니다 (디자이너 11-10).
 * 피그마의 '설정' 아래 두 번째 '위치수집'은 '프라이버시'와 겹쳐 한 번만 둡니다.
 */
const SECTIONS: { key: string; items: Entry[] }[] = [
  {
    key: 'privacy',
    items: [
      { key: 'myLocation', icon: ICONS.locationInfo, href: 'myLocation' },
      { key: 'hideMode', icon: ICONS.hideMode, href: '/settings/hide-mode' },
      { key: 'notifications', icon: ICONS.notifications, href: '/settings/notifications' },
      { key: 'safeZone', icon: ICONS.safeZone, href: '/settings/geofences' },
      { key: 'location', icon: ICONS.locationCollect, href: '/settings/location' },
    ],
  },
  {
    key: 'safety',
    items: [
      { key: 'safety', icon: ICONS.safetySos, href: '/settings/safety', danger: true },
      { key: 'sosHistory', icon: ICONS.safetySos, href: '/sos-received', danger: true },
      { key: 'messages', icon: ICONS.scheduledMessage, href: '/settings/scheduled-messages' },
    ],
  },
  {
    key: 'social',
    items: [
      { key: 'friends', icon: ICONS.friends, href: '/settings/friends' },
      { key: 'groups', icon: ICONS.group, href: '/settings/groups' },
    ],
  },
  { key: 'account', items: [{ key: 'premium', icon: ICONS.premium, href: '/plans/my-plan' }] },
  {
    key: 'records',
    items: [
      // 위치 확인 기록은 히스토리의 '위치 확인' 탭으로 합쳤습니다 (대표 리포트 2차 111)
      { key: 'history', icon: ICONS.locationInfo, href: '/settings/history' },
    ],
  },
  {
    key: 'settings',
    items: [
      { key: 'map', icon: ICONS.map, href: '/settings/map' },
      { key: 'languageRegion', icon: ICONS.language, href: '/settings/language' },
      { key: 'account', icon: ICONS.document, href: '/settings/account' },
    ],
  },
  { key: 'legal', items: [{ key: 'legal', icon: ICONS.document, href: '/settings/legal' }] },
  { key: 'about', items: [{ key: 'contact', icon: ICONS.document, href: '/settings/contact' }] },
];

export default function MyProfileScreen() {
  const styles = useStyles();
  const colors = useColors();
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

  const locationCard = (
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
            {formatDate(info.timestamp, 'full')}
          </AppText>
          {[
            t('myProfile.currentLocation', { address: info.address }),
            t('myProfile.coordinates', { lat: info.latitude.toFixed(4), lng: info.longitude.toFixed(4) }),
            info.altitude != null ? t('myProfile.altitude', { altitude: info.altitude.toFixed(1) }) : null,
            info.accuracy != null ? t('myProfile.accuracy', { accuracy: Math.round(info.accuracy) }) : null,
            t('myProfile.measuredAt', { time: formatTimeOfDay(info.timestamp, { seconds: true }) }),
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
  );

  return (
    <Screen
      title={t('screens.myProfile')}
      tab="map"
      contentStyle={styles.content}
      // 대표 리포트 93: 오른쪽 위 톱니는 아래 메뉴와 같은 화면이라 뺐습니다
    >
      <ProfileCard onPress={() => router.push('/settings/profile-edit')} />
      {SECTIONS.map((section) => (
        <Fragment key={section.key}>
          <View style={styles.sectionRow}>
            <AppText variant="listTitle">{t(`settingsHome.section.${section.key}`)}</AppText>
          </View>
          {section.items.map((item) =>
            item.href === 'myLocation' && open ? (
              <Fragment key={item.key}>
                <MenuRow label={t(`settingsHome.${item.key}`)} icon={item.icon} onPress={toggleLocation} />
                {locationCard}
              </Fragment>
            ) : (
              <MenuRow
                key={item.key}
                label={t(`settingsHome.${item.key}`)}
                icon={item.icon}
                color={item.danger ? colors.danger : undefined}
                onPress={() => (item.href === 'myLocation' ? void toggleLocation() : router.push(item.href))}
              />
            ),
          )}
        </Fragment>
      ))}
    </Screen>
  );
}

/** 피그마 메뉴 줄: 반투명 카드, 왼쪽 20 에 25px 그림 아이콘, 8 띄우고 15 bold 글자 */
function MenuRow({ label, icon, color, onPress }: { label: string; icon: ImageSourcePropType; color?: string; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <Image source={icon} style={styles.icon} />
      <AppText variant="listTitle" color={color} style={styles.flex}>
        {label}
      </AppText>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  content: { gap: 5 },
  flex: { flex: 1 },
  sectionRow: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceGlass,
  },
  row: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 4,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceGlass,
  },
  icon: { width: 25, height: 25 },
  pressed: { opacity: 0.7 },
  locationCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.surfaceStrong,
    backgroundColor: colors.surfaceGlass,
    padding: 12,
    gap: 6,
  },
  locationHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  bullet: { flexDirection: 'row', gap: 8, paddingLeft: 8 },
}));
