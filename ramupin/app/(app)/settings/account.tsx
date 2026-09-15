import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { MenuItem, Popup, Screen } from '@/components/ui';
import { ProfileCard } from '@/features/settings/ProfileCard';
import { useAuthStore } from '@/stores/authStore';

/** 피그마: 계정 관리 (283:27229) */
export default function AccountScreen() {
  const { t } = useTranslation();
  const signOut = useAuthStore((s) => s.signOut);
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
          // TODO(5단계): 서버 토큰 폐기, 푸시 토큰 해제. 개발 중 로그인 건너뛰기가 켜져 있으면 가입 첫 화면으로 이동
          setConfirmLogout(false);
          signOut();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 8 },
});
