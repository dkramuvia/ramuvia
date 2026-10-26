import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { galleryApi } from '@/api/endpoints/gallery';
import { AppText, Button, Popup } from '@/components/ui';
import { useDeviceRestoreStore } from '@/features/auth/deviceRestore';
import { notMeLogout } from '@/features/auth/session';
import { useFriends } from '@/features/friends/queries';
import { useMyGroups } from '@/features/groups/queries';
import { usePlan } from '@/features/policy/usePlan';
import { useGeofences } from '@/features/settings/queries';
import { makeStyles, radius, useColors, withAlpha } from '@/theme';
import { showToast } from '@/utils/toast';

/**
 * 새 기기 로그인 · 서버 복원 (보완 화면 설계 4.21, 피그마 v2.4 1015:45865, 수정 반영본 C10).
 * 다른 기기에서 쓰던 계정으로 로그인한 직후 한 번 보여 줍니다.
 *
 * - 데이터는 서버에 있어 따로 복원할 것이 없습니다. 무엇이 그대로인지 보여 줍니다 (이동 기록은 등급 보관 기간만)
 * - 위치는 계정당 한 기기: 이전 기기는 위치 공유가 멈추고 로그아웃됐고, 푸시로 알렸습니다 (서버)
 * - [내가 로그인한 게 아니에요]: 이 기기 세션을 끊고 이전 기기를 되살립니다. 라무핀은 소셜 로그인이라
 *   비밀번호가 없으므로, 휴대폰 인증을 다시 하고 고객센터에 알리도록 안내합니다
 */
export default function DeviceRestoreScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const replaced = useDeviceRestoreStore((s) => s.replaced);
  const clear = useDeviceRestoreStore((s) => s.set);
  const { data: friends = [] } = useFriends();
  const { data: groups = [] } = useMyGroups();
  const { data: places = [] } = useGeofences();
  const { data: storage } = useQuery({ queryKey: ['gallery', 'storage'], queryFn: galleryApi.storage });
  const { policy } = usePlan();
  const [confirm, setConfirm] = useState(false);

  const done = () => {
    clear(null);
    if (router.canGoBack()) router.back();
    else router.replace('/map');
  };

  const notMe = async () => {
    setConfirm(false);
    const restored = await notMeLogout();
    showToast(t(restored ? 'deviceRestore.notMeRestored' : 'deviceRestore.notMeDone'));
  };

  const rows = [
    { label: t('deviceRestore.friends', { count: friends.length }), value: t('deviceRestore.restored') },
    { label: t('deviceRestore.groups', { count: groups.filter((g) => g.memberCount > 2).length }), value: t('deviceRestore.restored') },
    { label: t('deviceRestore.places', { count: places.length }), value: t('deviceRestore.restored') },
    { label: t('deviceRestore.photos', { size: storage ? `${Math.round(storage.usedMb)}MB` : '-' }), value: t('deviceRestore.restored') },
    { label: t('deviceRestore.history'), value: t('deviceRestore.historyValue', { days: policy?.locationRetentionDays ?? '-' }), muted: true },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.body}>
        <AppText variant="title2">{t('deviceRestore.title')}</AppText>
        <AppText variant="body2" color={colors.textSecondary}>
          {t('deviceRestore.subtitle')}
        </AppText>

        <View style={styles.card}>
          {rows.map((r) => (
            <View key={r.label} style={styles.row}>
              <AppText variant="body2" style={styles.flex}>
                {r.label}
              </AppText>
              <AppText variant="label1Bold" color={r.muted ? colors.textTertiary : colors.online}>
                {r.value}
              </AppText>
            </View>
          ))}
        </View>

        <View style={styles.warn}>
          <AppText variant="body2Bold">{t('deviceRestore.shareHere')}</AppText>
          <AppText variant="label2" color={colors.textSecondary}>
            {t('deviceRestore.shareHereDesc', { model: replaced?.model ?? t('deviceRestore.previousDevice') })}
          </AppText>
        </View>

        <AppText variant="caption" color={colors.textTertiary}>
          {t('deviceRestore.security')}
        </AppText>
      </View>

      <View style={styles.actions}>
        <Button label={t('deviceRestore.continue')} variant="brown" size="lg" onPress={done} />
        <Button label={t('deviceRestore.notMe')} variant="white" size="lg" onPress={() => setConfirm(true)} />
      </View>

      <Popup
        visible={confirm}
        title={t('deviceRestore.notMeTitle')}
        message={t('deviceRestore.notMeMessage')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setConfirm(false)}
        onDismiss={() => setConfirm(false)}
        confirmLabel={t('deviceRestore.notMeConfirm')}
        onConfirm={() => void notMe()}
      />
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 20 },
  body: { flex: 1, gap: 16, paddingTop: 32 },
  flex: { flex: 1 },
  card: { gap: 14, padding: 16, borderRadius: radius.md, backgroundColor: colors.card },
  row: { flexDirection: 'row', alignItems: 'center' },
  warn: { gap: 6, padding: 16, borderRadius: radius.md, backgroundColor: withAlpha('#FFC700', 0.18) },
  actions: { gap: 10, paddingBottom: 16 },
}));
