import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { apiClient } from '@/api/client';
import { usersApi } from '@/api/endpoints/users';
import { AppText, Button } from '@/components/ui';
import { logout } from '@/features/auth/session';
import { useAuthStore } from '@/stores/authStore';
import { makeStyles, radius, useColors } from '@/theme';
import { showToast } from '@/utils/toast';

interface GuardianStatus {
  required: boolean;
  consented: boolean;
  guardianName?: string;
  maskedPhone?: string;
  expiresAt?: string;
  resendLeft?: number;
}

const fetchStatus = async () => (await apiClient.get<GuardianStatus>('/me/guardian')).data;

/**
 * 보호자 동의 대기 (만 14세 미만, 보완 4.1).
 * 보호자가 문자 링크에서 동의할 때까지 이 화면만 보이고, 서버는 위치를 받지 않습니다.
 * 15초마다 확인해서 동의되면 바로 앱으로 들어갑니다. 24시간이 지나면 입력한 정보는 서버에서 지워집니다.
 */
export default function GuardianWaitingScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const updateUser = useAuthStore((s) => s.updateUser);
  const { data, refetch } = useQuery({ queryKey: ['guardian-status'], queryFn: fetchStatus, refetchInterval: 15_000 });

  useEffect(() => {
    if (!data?.consented) return;
    void (async () => {
      const me = await usersApi.me();
      updateUser(me);
      router.replace('/map');
    })();
  }, [data?.consented, updateUser]);

  const resend = async () => {
    try {
      await apiClient.post('/me/guardian/resend');
      await refetch();
      showToast(t('guardian.resent'));
    } catch (error) {
      const message = (error as { response?: { data?: { message?: unknown } } }).response?.data?.message;
      showToast(typeof message === 'string' ? message : t('common.requestFailed'));
    }
  };

  const expires = data?.expiresAt ? new Date(data.expiresAt).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.body}>
        <AppText variant="title2">{t('guardian.waitingTitle')}</AppText>
        <AppText variant="body2" color={colors.textSecondary}>
          {t('guardian.waitingDesc', { name: data?.guardianName ?? '', phone: data?.maskedPhone ?? '' })}
        </AppText>
        <View style={styles.card}>
          <AppText variant="label2" color={colors.textSecondary}>
            {t('guardian.waitingUntil', { time: expires })}
          </AppText>
          <AppText variant="caption" color={colors.textTertiary}>
            {t('guardian.waitingNote')}
          </AppText>
        </View>
      </View>
      <View style={styles.actions}>
        <Button label={t('guardian.resend', { count: data?.resendLeft ?? 0 })} variant="brown" size="lg" disabled={!data?.resendLeft} onPress={() => void resend()} />
        <Button label={t('guardian.check')} variant="white" size="lg" onPress={() => void refetch()} />
        <Button label={t('account.logout')} variant="neutral" size="md" onPress={() => void logout()} />
      </View>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 20 },
  body: { flex: 1, gap: 14, paddingTop: 48 },
  card: { gap: 6, padding: 16, borderRadius: radius.md, backgroundColor: colors.surface },
  actions: { gap: 10, paddingBottom: 16 },
}));
