import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { MenuItem, Screen } from '@/components/ui';
import { ProfileCard } from '@/features/settings/ProfileCard';
import { colors } from '@/theme';

const MENU: { key: string; href: Href; danger?: boolean }[] = [
  { key: 'premium', href: '/plans' },
  { key: 'messages', href: '/settings/scheduled-messages' },
  { key: 'notifications', href: '/settings/notifications' },
  { key: 'friends', href: '/settings/friends' },
  { key: 'groups', href: '/settings/groups' },
  { key: 'safeZone', href: '/settings/geofences' },
  { key: 'safety', href: '/settings/safety', danger: true },
  { key: 'map', href: '/settings/map' },
  { key: 'account', href: '/settings/account' },
];

/** 피그마: 설정 (283:31571) */
export default function SettingsMenuScreen() {
  const { t } = useTranslation();

  return (
    <Screen title={t('screens.settingsMenu')} tab="map" contentStyle={styles.content}>
      <ProfileCard onPress={() => router.push('/settings/profile-edit')} />
      {MENU.map((item) => (
        <MenuItem
          key={item.key}
          label={t(`settingsMenu.${item.key}`)}
          color={item.danger ? colors.danger : colors.text}
          onPress={() => router.push(item.href)}
        />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 8 },
});
