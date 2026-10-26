import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { galleryApi } from '@/api/endpoints/gallery';
import { AppText, Button, Screen } from '@/components/ui';
import { PLAN_NAMES } from '@/features/policy/policies';
import { usePlan } from '@/features/policy/usePlan';
import { useGeofences, useSafetySetting, useScheduledMessages } from '@/features/settings/queries';
import { makeStyles, radius, useColors } from '@/theme';

/**
 * 내 플랜 · 사용량 (보완 화면 설계 4.7, 피그마 v2.4 1015:50450).
 * 나의 프로필 › 프리미엄 서비스 → 이 화면 → [플랜 비교 · 변경] → 결제 플랜.
 *
 * 10-26 대표님: 그룹 프리미엄은 없고 개인 등급(베이직 무료 · 플래티넘 · 트리니티)만 있습니다.
 * 그래서 시안의 "그룹의 플래티넘 혜택이 적용돼요" 문구와 그룹 혜택 안내는 넣지 않았습니다.
 * 한도는 서버 등급 정책(관리자가 사람별로 바꾼 값 포함)을 그대로 씁니다.
 */
export default function MyPlanScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const { planId, policy, limit } = usePlan();
  const { data: places = [] } = useGeofences();
  const { data: safety } = useSafetySetting();
  const { data: messages = [] } = useScheduledMessages();
  const { data: storage } = useQuery({ queryKey: ['gallery', 'storage'], queryFn: galleryApi.storage });

  const sosCount = (safety?.recipientFriendIds.length ?? 0) + (safety?.recipientGroupIds.length ?? 0);
  const messageTargets = new Set(messages.map((m) => m.targetUserId)).size;

  const rows: { label: string; used: number; limit: number; unit: Unit }[] = [
    { label: t('myPlan.places'), used: places.length, limit: limit('placeLimit'), unit: 'count' },
    { label: t('myPlan.geofenceAlerts'), used: places.filter((p) => p.enabled).length, limit: limit('geofenceAlertLimit'), unit: 'count' },
    { label: t('myPlan.sosRecipients'), used: sosCount, limit: limit('sosRecipientLimit'), unit: 'people' },
    { label: t('myPlan.scheduledRecipients'), used: messageTargets, limit: limit('scheduledMessageRecipientLimit'), unit: 'people' },
    { label: t('myPlan.photoStorage'), used: storage?.usedMb ?? 0, limit: storage?.limitMb ?? limit('photoStorageMb'), unit: 'mb' },
  ];

  const format = (value: number, unit: Unit) =>
    unit === 'mb' ? formatMb(value) : unit === 'people' ? t('myPlan.people', { count: value }) : String(value);

  const free = planId === 'basic' || planId === 'care' || planId === 'guardian';
  const retention = policy?.locationRetentionDays;

  return (
    <Screen
      title={t('screens.myPlan')}
      tab="map"
      contentStyle={styles.content}
      footer={<Button label={t('myPlan.compare')} size="lg" shape="rounded" onPress={() => router.push('/plans')} />}
    >
      <View style={styles.planCard}>
        <AppText variant="label2" color={colors.textMuted}>
          {t('myPlan.current')}
        </AppText>
        <AppText variant="title3" color={colors.white}>
          {PLAN_NAMES[planId]}
        </AppText>
        <AppText variant="label2" color={colors.textOnDark}>
          {t(free ? 'myPlan.freeDesc' : 'myPlan.paidDesc')}
        </AppText>
      </View>

      <View style={styles.section}>
        <AppText variant="label1" color={colors.textLabel}>
          {t('myPlan.usage')}
        </AppText>
        <View style={styles.usageCard}>
          {rows.map((row) => {
            // 한도에 닿으면 빨간색 (4.7 업무 규칙)
            const full = row.limit > 0 && row.used >= row.limit;
            const ratio = row.limit > 0 ? Math.min(1, row.used / row.limit) : 0;
            return (
              <View key={row.label} style={styles.row}>
                <View style={styles.rowTop}>
                  <AppText variant="label1" style={styles.flex}>
                    {row.label}
                  </AppText>
                  <AppText variant="label1Bold" color={full ? colors.danger : colors.text}>
                    {format(row.used, row.unit)}
                    <AppText variant="label1" color={colors.textTertiary}>
                      {' / '}
                      {row.limit > 0 ? format(row.limit, row.unit) : t('myPlan.unavailable')}
                    </AppText>
                  </AppText>
                </View>
                <View style={styles.track}>
                  <View style={[styles.bar, { width: `${ratio * 100}%`, backgroundColor: full ? colors.danger : colors.brownLight }]} />
                </View>
              </View>
            );
          })}
          <View style={styles.rowTop}>
            <AppText variant="label1" style={styles.flex}>
              {t('myPlan.retention')}
            </AppText>
            <AppText variant="label1Bold">{retention ? t('myPlan.days', { count: retention }) : '-'}</AppText>
          </View>
        </View>
      </View>

      <View style={styles.note}>
        <AppText variant="label2" color={colors.textSecondary}>
          {t('myPlan.retentionNote')}
        </AppText>
        {free ? null : (
          <AppText variant="label2" color={colors.textSecondary}>
            {t('myPlan.billingDayNote')}
          </AppText>
        )}
      </View>
    </Screen>
  );
}

type Unit = 'count' | 'people' | 'mb';

function formatMb(mb: number): string {
  if (mb >= 1024) return `${Number((mb / 1024).toFixed(1))}GB`;
  return `${Math.round(mb)}MB`;
}

const useStyles = makeStyles((colors) => ({
  content: { gap: 24, paddingTop: 16 },
  flex: { flex: 1 },
  planCard: { gap: 6, padding: 20, borderRadius: radius.md, backgroundColor: colors.chatBubbleMine },
  section: { gap: 8 },
  usageCard: { gap: 18, padding: 16, borderRadius: radius.md, backgroundColor: colors.card },
  row: { gap: 8 },
  rowTop: { flexDirection: 'row', alignItems: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.surfaceStrong, overflow: 'hidden' },
  bar: { height: 4, borderRadius: 2 },
  note: { gap: 6, padding: 16, borderRadius: radius.md, backgroundColor: colors.surface },
}));
