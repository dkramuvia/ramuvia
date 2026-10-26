import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { friendsApi } from '@/api/endpoints/friends';
import { AppText, Avatar, Button, Popup, QueryState } from '@/components/ui';
import { friendKeys } from '@/features/friends/queries';
import { fetchSharingOverview, markSharingReminderShown, type SharingViewer } from '@/features/safety/sharingReminder';
import { makeStyles, radius, useColors, withAlpha } from '@/theme';
import { formatRelativeTime } from '@/utils/time';
import { showToast } from '@/utils/toast';

/**
 * 위치 공유 중 알림 (스토킹 방지, 보완 화면 설계 4.12, 피그마 v2.4 1015:47250).
 * 30일마다, 그리고 새 공유가 시작된 다음 날 자동으로 뜹니다 (features/safety/sharingReminder.ts).
 * 개인정보 센터에서 직접 열 수도 있습니다.
 *
 * - 조회가 갑자기 많은 사람은 노란색으로 강조합니다 ("하루 42회 확인")
 * - [멈추기]는 그 친구를 "비공개" 로 바로 바꿉니다 (친구 관계는 유지, 상대에게 알림 없음)
 */
export default function SharingReminderScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: viewers = [], isLoading, isError, refetch } = useQuery({ queryKey: ['sharing-overview'], queryFn: fetchSharingOverview });
  const [stopped, setStopped] = useState<string[]>([]);
  const [guide, setGuide] = useState(false);

  const visible = viewers.filter((v) => !stopped.includes(v.id));

  const stop = async (viewer: SharingViewer) => {
    try {
      // 공유를 멈춤 = 이 친구에게 "비공개" (위치·상태·경로·배터리 모두 끔)
      await friendsApi.saveShareSetting({ friendId: viewer.id, locationLevel: 'hidden', showStatus: false, shareRoute: false, shareBattery: false });
      setStopped([...stopped, viewer.id]);
      void queryClient.invalidateQueries({ queryKey: friendKeys.list, exact: true });
      showToast(t('sharingReminder.stopped', { name: viewer.nickname }));
    } catch {
      showToast(t('common.requestFailed'));
    }
  };

  const close = () => {
    void markSharingReminderShown();
    if (router.canGoBack()) router.back();
    else router.replace('/map');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.body}>
        <AppText variant="title2">{t('sharingReminder.title', { count: visible.length })}</AppText>
        <AppText variant="body2" color={colors.textSecondary}>
          {t('sharingReminder.subtitle')}
        </AppText>

        {isLoading || isError ? <QueryState loading={isLoading} error={isError} onRetry={() => void refetch()} /> : null}

        <View style={styles.list}>
          {visible.map((v) => (
            <View key={v.id} style={[styles.row, v.unusual && styles.rowUnusual]}>
              <Avatar name={v.nickname} imageUrl={v.avatarUrl ?? undefined} size={36} />
              <View style={styles.flex}>
                <AppText variant="body2Bold">{v.nickname}</AppText>
                <AppText variant="caption" color={v.unusual ? colors.sos : colors.textTertiary}>
                  {[
                    t(`friendShare.${v.level}`),
                    t('sharingReminder.since', { date: new Date(v.sharingSince).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' }) }),
                    v.unusual
                      ? t('sharingReminder.viewsToday', { count: v.viewsToday })
                      : v.lastViewedAt
                        ? t('sharingReminder.lastViewed', { time: formatRelativeTime(v.lastViewedAt) })
                        : t('sharingReminder.notViewed'),
                  ].join(' · ')}
                </AppText>
              </View>
              <Button label={t('sharingReminder.stop')} size="xs" variant={v.unusual ? 'danger' : 'neutral'} onPress={() => void stop(v)} />
            </View>
          ))}
        </View>

        <AppText variant="caption" color={colors.textTertiary}>
          {t('sharingReminder.note')}
        </AppText>
      </View>

      <View style={styles.actions}>
        <Button label={t('sharingReminder.allOk')} variant="brown" size="lg" onPress={close} />
        <Button label={t('sharingReminder.help')} variant="white" size="lg" onPress={() => setGuide(true)} />
      </View>

      <Popup visible={guide} title={t('report.guideTitle')} message={t('report.guideMessage')} confirmLabel={t('common.confirm')} onConfirm={() => setGuide(false)} />
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 20 },
  body: { flex: 1, gap: 14, paddingTop: 32 },
  flex: { flex: 1 },
  list: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, backgroundColor: colors.surface },
  rowUnusual: { backgroundColor: withAlpha('#FFC700', 0.22) },
  actions: { gap: 10, paddingBottom: 16 },
}));
