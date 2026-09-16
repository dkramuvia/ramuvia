import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { MenuItem, Popup, Screen } from '@/components/ui';
import { ProfileCard } from '@/features/settings/ProfileCard';
import { logout } from '@/features/auth/session';

/** 피그마: 계정 관리 (283:27229) */
export default function AccountScreen() {
  const { t } = useTranslation();
  const [confirmLogout, setConfirmLogout] = useState(false);

  return (
    <Screen title={t('screens.account')} tab="map" contentStyle={styles.content}>
      <ProfileCard onPress={() => router.push('/settings/profile-edit')} />
      <MenuItem label={t('account.logout')} onPress={() => setConfirmLogout(true)} />
      <MenuItem label={t('account.withdraw')} onPress={() => router.push('/settings/withdraw')} />

      <Popup
        visible={confirmLogout}
        title={t('account.logoutTitle')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setConfirmLogout(false)}
        onDismiss={() => setConfirmLogout(false)}
        confirmLabel={t('account.logout')}
        onConfirm={() => {
          // TODO(푸시 단계): 푸시 토큰 해제
          setConfirmLogout(false);
          logout();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 8 },
});
