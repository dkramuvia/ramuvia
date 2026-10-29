import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, MenuItem, Screen } from '@/components/ui';
import { useColors } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];
type MenuEntry = { key: string; href: Href; icon: IconName; danger?: boolean };

// 대표 리포트 94: 메뉴가 길어 구역(안전 / 친구·그룹 / 지도·위치 / 계정)으로 나눴습니다
const SECTIONS: { titleKey: string; items: MenuEntry[] }[] = [
  {
    titleKey: 'sectionSafety',
    items: [
      { key: 'safety', href: '/settings/safety', icon: 'shield-checkmark-outline', danger: true },
      { key: 'sosReceived', href: '/sos-received', icon: 'alert-circle-outline', danger: true },
      { key: 'safeZone', href: '/settings/geofences', icon: 'location-outline' },
    ],
  },
  {
    titleKey: 'sectionSocial',
    items: [
      { key: 'friends', href: '/settings/friends', icon: 'people-outline' },
      { key: 'groups', href: '/settings/groups', icon: 'chatbubbles-outline' },
      { key: 'messages', href: '/settings/scheduled-messages', icon: 'time-outline' },
    ],
  },
  {
    titleKey: 'sectionMap',
    items: [
      { key: 'map', href: '/settings/map', icon: 'map-outline' },
      { key: 'location', href: '/settings/location', icon: 'navigate-outline' },
    ],
  },
  {
    titleKey: 'sectionAccount',
    items: [
      { key: 'premium', href: '/plans/my-plan', icon: 'star-outline' },
      { key: 'notifications', href: '/settings/notifications', icon: 'notifications-outline' },
      // 보완 4.14: 설정 메뉴에 언어 · 지역 추가
      { key: 'languageRegion', href: '/settings/language', icon: 'globe-outline' },
      { key: 'account', href: '/settings/account', icon: 'person-outline' },
    ],
  },
];

/** 피그마: 설정 (283:31571) */
export default function SettingsMenuScreen() {
  const colors = useColors();
  const { t } = useTranslation();

  // 대표 리포트 21: 위쪽 내 이름 카드는 나의 프로필 화면에 이미 있어 뺐습니다
  return (
    <Screen title={t('screens.settingsMenu')} tab="map" contentStyle={styles.content}>
      {SECTIONS.map((section) => (
        <View key={section.titleKey} style={styles.section}>
          <AppText variant="label2" color={colors.textSecondary} style={styles.sectionTitle}>
            {t(`settingsMenu.${section.titleKey}`)}
          </AppText>
          {section.items.map((item) => {
            const color = item.danger ? colors.danger : colors.text;
            return (
              <MenuItem
                key={item.key}
                label={t(`settingsMenu.${item.key}`)}
                color={color}
                icon={
                  <View style={styles.icon}>
                    <Ionicons name={item.icon} size={20} color={color} />
                  </View>
                }
                onPress={() => router.push(item.href)}
              />
            );
          })}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 20 },
  section: { gap: 8 },
  sectionTitle: { paddingHorizontal: 4 },
  icon: { marginRight: 8 },
});
