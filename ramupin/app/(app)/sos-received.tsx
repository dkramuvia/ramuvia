import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Avatar, QueryState, Screen } from '@/components/ui';
import { useReceivedSos } from '@/features/sos/queries';
import { colors, radius } from '@/theme';
import type { ReceivedSos } from '@/api/endpoints/sos';
import { formatRelativeTime } from '@/utils/time';

/**
 * 내가 받은 SOS (WBS 7.9, 9.7).
 *
 * 팝업은 앱이 켜져 있을 때만 뜹니다. 놓친 SOS를 나중에라도 볼 수 있어야 해서
 * 목록으로 따로 둡니다. 누르면 그 사람의 이동 기록으로 갑니다.
 */
export default function ReceivedSosScreen() {
  const { t } = useTranslation();
  const { data = [], isLoading, isError, refetch } = useReceivedSos();

  return (
    <Screen title={t('screens.sosReceived')} tab="map" contentStyle={styles.content}>
      <QueryState loading={isLoading} error={isError} onRetry={() => void refetch()} />

      {!isLoading && !isError && data.length === 0 ? (
        <AppText variant="label1" color={colors.textMuted}>
          {t('sosReceived.empty')}
        </AppText>
      ) : null}

      {data.map((sos) => (
        <SosCard key={sos.id} sos={sos} />
      ))}
    </Screen>
  );
}

function SosCard({ sos }: { sos: ReceivedSos }) {
  const { t } = useTranslation();
  const cancelled = sos.status === 'cancelled';
  const place = sos.placeName ?? sos.placeAddress ?? t('sosReceived.noPlace');

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/journey/${sos.userId}`)}
      style={[styles.card, cancelled && styles.cardDim]}
    >
      <Avatar name={sos.nickname} />
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <AppText variant="listTitle">{t('sosReceived.title', { name: sos.nickname })}</AppText>
          {/* 취소된 SOS도 지웁니다가 아니라 남겨 둡니다 — 나중에 "그때 무슨 일이었나"의 근거입니다 */}
          {cancelled ? (
            <AppText variant="micro" color={colors.textTertiary}>
              {t('sosReceived.cancelled')}
            </AppText>
          ) : null}
        </View>
        <AppText variant="label2" color={colors.textSecondary} numberOfLines={1}>
          {place}
        </AppText>
        <AppText variant="micro" color={colors.textTertiary}>
          {formatRelativeTime(sos.startedAt)}
        </AppText>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  cardDim: { opacity: 0.55 },
  body: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
