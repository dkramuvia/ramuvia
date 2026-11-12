import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, SectionList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { feedApi } from '@/api';
import { AppText, BottomNav, ChipTabs, Header, QueryState } from '@/components/ui';
import { useAlertStore } from '@/features/alerts/alertStore';
import { popupForHistory } from '@/features/alerts/samples';
import i18n from '@/i18n';
import { useHistory, useJourney, useJourneyStats } from '@/features/settings/queries';
import { formatDistance, usePreferencesStore } from '@/stores/preferencesStore';
import { useAuthStore } from '@/stores/authStore';
import { layout, makeStyles, radius, useColors } from '@/theme';
import type { FeedItemType, HistoryEvent, HistoryEventType } from '@/types/models';
import { formatDate, formatTimeOfDay } from '@/utils/time';

/** views: 위치 확인 기록. 따로 있던 메뉴를 히스토리 탭으로 합쳤습니다 (대표 리포트 2차 111) */
type Tab = 'all' | 'safety' | 'place' | 'views';

/** 대표 리포트 95: 종류마다 아이콘 (있는 그림을 나눠 씁니다). 서버가 새 종류를 보내면 DEFAULT_ICON */
const EVENT_ICONS: Record<HistoryEventType, number> = {
  sos: require('../../../assets/icons/history-sos.png'),
  geofenceArrive: require('../../../assets/icons/history-safezone.png'),
  geofenceLeave: require('../../../assets/icons/history-safezone.png'),
  batteryLow: require('../../../assets/icons/history-battery.png'),
  gpsLost: require('../../../assets/icons/feed-checked.png'),
  noMovement: require('../../../assets/icons/alert-no-movement.png'),
  speeding: require('../../../assets/icons/alert-speeding.png'),
  dangerZone: require('../../../assets/icons/history-sos.png'),
  nearby: require('../../../assets/icons/feed-nearby.png'),
  friendRequest: require('../../../assets/icons/card-request.png'),
  placeShared: require('../../../assets/icons/card-place.png'),
  notice: require('../../../assets/icons/card-request.png'),
};
const DEFAULT_ICON = require('../../../assets/icons/card-request.png');
const FEED_ICONS: Partial<Record<FeedItemType, number>> = {
  stay: require('../../../assets/icons/feed-stay.png'),
  nearby: require('../../../assets/icons/feed-nearby.png'),
  checkedLocation: require('../../../assets/icons/feed-checked.png'),
};
const PLACE_PIN = require('../../../assets/icons/place-pin.png');

/**
 * 피그마: 히스토리 전체 (283:25776) / 장소·이동 (283:25871)
 * 기획: 전체 = 알림 내역, 긴급/안전 = 긴급 알림만, 장소/이동 = 장소 기록과 이동 히스토리 (이동 기록을 누르면 하루 여정)
 */
export default function HistoryScreen() {
  const styles = useStyles();
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('all');

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <Header title={t('screens.history')} />
      <View style={styles.tabs}>
        <ChipTabs
          value={tab}
          onChange={setTab}
          options={[
            { value: 'all', label: t('history.all') },
            { value: 'safety', label: t('history.safety') },
            { value: 'place', label: t('history.place') },
            { value: 'views', label: t('history.views') },
          ]}
        />
      </View>
      {/* 대표 리포트 2차 110: 탭을 바꾸면 불러오는 동안 목록 자리가 줄어 아래 메뉴가 위로 올라왔습니다. 자리를 늘 채웁니다 */}
      <View style={styles.flex}>
        {tab === 'place' ? (
          <PlaceHistory />
        ) : tab === 'views' ? (
          <ViewsHistory />
        ) : (
          <EventHistory category={tab === 'safety' ? 'safety' : undefined} />
        )}
      </View>
      <BottomNav active="map" />
    </SafeAreaView>
  );
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const date = formatDate(d, 'monthDayWeekday');
  if (d.toDateString() === today.toDateString()) return i18n.t('history.today', { date });
  if (d.toDateString() === yesterday.toDateString()) return i18n.t('history.yesterday', { date });
  return date;
}

/** 날짜별로 묶기 (최신 순서 그대로) */
function byDay<T extends { createdAt: string }>(items: T[]) {
  const groups = new Map<string, T[]>();
  items.forEach((e) => {
    const key = new Date(e.createdAt).toDateString();
    groups.set(key, [...(groups.get(key) ?? []), e]);
  });
  return [...groups.values()].map((data) => ({ title: dayLabel(data[0].createdAt), data }));
}

/**
 * 기록 한 줄. 대표 리포트 2차 109: 칸이 너무 커서 한 화면에 몇 개 안 보였습니다.
 * 아이콘을 작게, 시각을 같은 줄 오른쪽에 두어 높이를 절반쯤으로 줄였습니다
 */
function HistoryRow({ icon, message, time, sos, onPress }: { icon?: number; message: string; time: string; sos?: boolean; onPress?: () => void }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <Pressable accessibilityRole="button" disabled={!onPress} onPress={onPress} style={[styles.eventCard, sos && styles.eventSos]}>
      {icon ? <Image source={icon} style={styles.eventIcon} /> : null}
      {/* SOS 칸은 늘 연분홍이라 그 위 글자도 고정으로 어둡게 (테마를 따르면 다크에서 안 보입니다) */}
      <AppText variant="body2Bold" color={sos ? ON_SOS : colors.text} style={styles.flex}>
        {message}
      </AppText>
      <AppText variant="label2" color={sos ? ON_SOS_SUB : colors.textTertiary}>
        {time}
      </AppText>
    </Pressable>
  );
}

function ViewsHistory() {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const { data: feed = [], isLoading, isError, refetch } = useQuery({ queryKey: ['feed'], queryFn: feedApi.list });
  const sections = useMemo(() => byDay(feed), [feed]);

  if (isLoading || isError) return <QueryState loading={isLoading} error={isError} onRetry={() => void refetch()} />;

  return (
    <SectionList
      sections={sections}
      keyExtractor={(e) => e.id}
      contentContainerStyle={styles.list}
      stickySectionHeadersEnabled={false}
      ListEmptyComponent={
        <AppText variant="label1" color={colors.textMuted} align="center" style={styles.empty}>
          {t('locationViews.empty')}
        </AppText>
      }
      renderSectionHeader={({ section }) => (
        <AppText variant="label1" color={colors.textSecondary} style={styles.sectionHeader}>
          {section.title}
        </AppText>
      )}
      renderItem={({ item }) => <HistoryRow icon={FEED_ICONS[item.type]} message={item.message} time={formatTimeOfDay(item.createdAt)} />}
    />
  );
}

function EventHistory({ category }: { category?: 'safety' }) {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const { data: events = [], isLoading, isError, refetch } = useHistory(category);
  const showPopup = useAlertStore((s) => s.showPopup);

  const sections = useMemo(() => byDay<HistoryEvent>(events), [events]);

  if (isLoading || isError) return <QueryState loading={isLoading} error={isError} onRetry={() => void refetch()} />;

  return (
    <SectionList
      sections={sections}
      keyExtractor={(e) => e.id}
      contentContainerStyle={styles.list}
      stickySectionHeadersEnabled={false}
      ListEmptyComponent={
        <AppText variant="label1" color={colors.textMuted} align="center" style={styles.empty}>
          {t('history.empty')}
        </AppText>
      }
      renderSectionHeader={({ section }) => (
        <AppText variant="label1" color={colors.textSecondary} style={styles.sectionHeader}>
          {section.title}
        </AppText>
      )}
      renderItem={({ item }) => (
        <HistoryRow
          icon={EVENT_ICONS[item.type] ?? DEFAULT_ICON}
          message={item.message}
          time={formatTimeOfDay(item.createdAt)}
          sos={item.type === 'sos'}
          // 서버 연동 전: 해당 알림 팝업 모양을 샘플 데이터로 보여줌
          onPress={() => {
            const popup = popupForHistory(item);
            if (popup) showPopup(popup, false);
          }}
        />
      )}
    />
  );
}

function PlaceHistory() {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const me = useAuthStore((s) => s.user);
  const unit = usePreferencesStore((s) => s.distanceUnit);
  const { data: journey, isLoading, isError, refetch } = useJourney(me?.id ?? '');
  // 위쪽 합계는 최근 7일·30일 (서버 통계). 날짜별 칸은 오늘 여정
  const [days, setDays] = useState<7 | 30>(7);
  const { data: stats } = useJourneyStats(days);

  if (isLoading || isError) return <QueryState loading={isLoading} error={isError} onRetry={() => void refetch()} />;
  if (!journey) return null;

  const mostVisited = stats?.topPlaces[0];

  const periodSummary = stats ? (
    <View style={styles.summaryRow}>
      <AppText variant="body2Bold" style={styles.flex}>
        {t('history.totalDistance', { distance: formatDistance(stats.totalDistanceM, unit) })}
      </AppText>
      <View style={styles.visited}>
        <Image source={PLACE_PIN} style={styles.pinIcon} />
        <AppText variant="body2Bold">{t('history.visited', { count: stats.stopCount })}</AppText>
      </View>
    </View>
  ) : null;

  const summary = (
    <View style={styles.summaryRow}>
      <AppText variant="body2Bold" style={styles.flex}>
        {t('history.totalDistance', { distance: formatDistance(journey.totalDistanceM, unit) })}
      </AppText>
      <View style={styles.visited}>
        <Image source={PLACE_PIN} style={styles.pinIcon} />
        <AppText variant="body2Bold">{t('history.visited', { count: journey.stops.length })}</AppText>
      </View>
    </View>
  );

  return (
    <SectionList
      sections={[{ title: dayLabel(`${journey.date}T12:00:00`), data: [journey] }]}
      keyExtractor={(j) => j.date}
      contentContainerStyle={styles.list}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={
        <View style={styles.placeHeader}>
          <AppText variant="body2Bold">{t('history.myPlaces')}</AppText>
          <ChipTabs<'7' | '30'>
            tone="dark"
            value={String(days) as '7' | '30'}
            onChange={(v) => setDays(v === '30' ? 30 : 7)}
            options={[
              { value: '7', label: t('history.last7') },
              { value: '30', label: t('history.last30') },
            ]}
          />
          {periodSummary}
          {mostVisited ? <AppText variant="label1">{t('history.mostVisited', { place: mostVisited.name, count: mostVisited.count })}</AppText> : null}
        </View>
      }
      renderSectionHeader={({ section }) => (
        <AppText variant="label1" color={colors.textSecondary} style={styles.sectionHeader}>
          {section.title}
        </AppText>
      )}
      renderItem={({ item }) => (
        <View style={styles.dayBlock}>
          {summary}
          {/* 기획: 이동 기록 박스를 누르면 나의 최근 여정 */}
          <Pressable accessibilityRole="button" onPress={() => router.push(`/journey/${item.userId}`)} style={styles.stopsCard}>
            {item.stops.map((stop) => (
              <View key={stop.arrivedAt} style={styles.stop}>
                {/* 대표 리포트 82: 긴 주소는 줄바꿈하고 시각은 오른쪽에 그대로 (주소가 시각을 밀어내지 않게) */}
                <View style={styles.stopTexts}>
                  <AppText variant="body2Bold">{stop.placeName || stop.address}</AppText>
                  {stop.placeName ? (
                    <AppText variant="label1" color={colors.textSecondary}>
                      {stop.address}
                    </AppText>
                  ) : null}
                </View>
                <AppText variant="label2" color={colors.textSecondary} style={styles.stopTime}>
                  {formatTimeOfDay(stop.arrivedAt)}
                </AppText>
              </View>
            ))}
          </Pressable>
        </View>
      )}
    />
  );
}

const ON_SOS = '#0C0D0E';
const ON_SOS_SUB = '#5D676F';

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  tabs: { paddingHorizontal: layout.screenPadding, paddingVertical: 8 },
  loading: { marginTop: 40 },
  list: { paddingHorizontal: layout.screenPadding, paddingBottom: 24, gap: 6 },
  empty: { paddingVertical: 48 },
  sectionHeader: { marginTop: 12, marginBottom: 4 },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  eventSos: { backgroundColor: '#F9D3CE' },
  eventIcon: { width: 28, height: 28 },
  placeHeader: { gap: 12, paddingVertical: 12 },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  visited: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  pinIcon: { width: 28, height: 28 },
  dayBlock: { gap: 12 },
  stopsCard: { borderRadius: radius.md, backgroundColor: colors.surface, paddingVertical: 8, paddingHorizontal: 20 },
  stop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14 },
  stopTexts: { flex: 1, flexShrink: 1, minWidth: 0 },
  stopTime: { flexShrink: 0, paddingTop: 2 },
}));
