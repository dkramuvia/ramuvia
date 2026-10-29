import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Image, View } from 'react-native';

import { feedApi } from '@/api';
import { AppText, QueryState, Screen } from '@/components/ui';
import { makeStyles, useColors } from '@/theme';
import type { FeedItemType } from '@/types/models';
import { formatMonthDayTime } from '@/utils/time';

const FEED_ICONS: Partial<Record<FeedItemType, number>> = {
  stay: require('../../../assets/icons/feed-stay.png'),
  nearby: require('../../../assets/icons/feed-nearby.png'),
  checkedLocation: require('../../../assets/icons/feed-checked.png'),
};

/**
 * 위치 확인 기록 — 누가 내 위치를 확인했는지 등 최근 활동.
 * 예전에는 지도 하단 시트에 있었는데, 시트는 친구 목록만 보이게 하고 나의 프로필로 옮겼습니다 (대표 리포트 7·28·61)
 */
export default function LocationViewsScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const { data: feed = [], isLoading, isError, refetch } = useQuery({ queryKey: ['feed'], queryFn: feedApi.list });

  return (
    <Screen title={t('locationViews.title')} tab="map" contentStyle={styles.content}>
      {isLoading || isError ? (
        <QueryState loading={isLoading} error={isError} onRetry={refetch} />
      ) : feed.length === 0 ? (
        <AppText variant="body2" color={colors.textTertiary} align="center" style={styles.empty}>
          {t('locationViews.empty')}
        </AppText>
      ) : (
        feed.map((item) => (
          <View key={item.id} style={styles.item}>
            {FEED_ICONS[item.type] ? <Image source={FEED_ICONS[item.type]} style={styles.icon} /> : <View style={styles.icon} />}
            <View style={styles.texts}>
              <AppText variant="headlineMedium">{item.message}</AppText>
              <AppText variant="body2" color={colors.textPlaceholder}>
                {formatMonthDayTime(item.createdAt)}
              </AppText>
            </View>
          </View>
        ))
      )}
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  content: { gap: 12 },
  empty: { paddingVertical: 40 },
  item: { flexDirection: 'row', gap: 16, paddingVertical: 8 },
  icon: { width: 48, height: 48 },
  texts: { flex: 1, gap: 12 },
}));
