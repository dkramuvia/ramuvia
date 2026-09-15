import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Pressable, SectionList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, BottomNav, ChipTabs, Header } from '@/components/ui';
import { useAlertStore } from '@/features/alerts/alertStore';
import { popupForHistory } from '@/features/alerts/samples';
import i18n from '@/i18n';
import { useHistory, useJourney } from '@/features/settings/queries';
import { formatDistance, usePreferencesStore } from '@/stores/preferencesStore';
import { useAuthStore } from '@/stores/authStore';
import { colors, layout, radius } from '@/theme';
import type { HistoryEvent, HistoryEventType } from '@/types/models';

type Tab = 'all' | 'safety' | 'place';

const EVENT_ICONS: Partial<Record<HistoryEventType, number>> = {
  sos: require('../../../assets/icons/history-sos.png'),
  geofenceArrive: require('../../../assets/icons/history-safezone.png'),
  geofenceLeave: require('../../../assets/icons/history-safezone.png'),
  batteryLow: require('../../../assets/icons/history-battery.png'),
};
const PLACE_PIN = require('../../../assets/icons/place-pin.png');

/**
 * 피그마: 히스토리 전체 (283:25776) / 장소·이동 (283:25871)
 * 기획: 전체 = 알림 내역, 긴급/안전 = 긴급 알림만, 장소/이동 = 장소 기록과 이동 히스토리 (이동 기록을 누르면 하루 여정)
 */
export default function HistoryScreen() {
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
          ]}
        />
      </View>
      {tab === 'place' ? <PlaceHistory /> : <EventHistory category={tab === 'safety' ? 'safety' : undefined} />}
      <BottomNav active="map" />
    </SafeAreaView>
  );
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const date = d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });
  if (d.toDateString() === today.toDateString()) return i18n.t('history.today', { date });
  if (d.toDateString() === yesterday.toDateString()) return i18n.t('history.yesterday', { date });
  return date;
}

function EventHistory({ category }: { category?: 'safety' }) {
  const { t } = useTranslation();
  const { data: events = [], isLoading } = useHistory(category);
  const showPopup = useAlertStore((s) => s.showPopup);

  const sections = useMemo(() => {
    const groups = new Map<string, HistoryEvent[]>();
    events.forEach((e) => {
      const key = new Date(e.createdAt).toDateString();
      groups.set(key, [...(groups.get(key) ?? []), e]);
    });
    return [...groups.values()].map((items) => ({ title: dayLabel(items[0].createdAt), data: items }));
  }, [events]);

  if (isLoading) return <ActivityIndicator style={styles.loading} color={colors.brown} />;

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
        <Pressable
          accessibilityRole="button"
          // 서버 연동 전: 해당 알림 팝업 모양을 샘플 데이터로 보여줌
          onPress={() => {
            const popup = popupForHistory(item);
            if (popup) showPopup(popup, false);
          }}
          style={[styles.eventCard, item.type === 'sos' && styles.eventSos]}
        >
          {EVENT_ICONS[item.type] ? <Image source={EVENT_ICONS[item.type]} style={styles.eventIcon} /> : <View style={styles.eventIcon} />}
          <View style={styles.eventTexts}>
            <AppText variant="body2Bold">{item.message}</AppText>
            <AppText variant="body2" color={colors.textTertiary}>
              {new Date(item.createdAt).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })}
            </AppText>
          </View>
        </Pressable>
      )}
    />
  );
}

function PlaceHistory() {
  const { t } = useTranslation();
  const me = useAuthStore((s) => s.user);
  const unit = usePreferencesStore((s) => s.distanceUnit);
  const { data: journey, isLoading } = useJourney(me?.id ?? '');

  if (isLoading) return <ActivityIndicator style={styles.loading} color={colors.brown} />;
  if (!journey) return null;

  // TODO(5단계): 기간 합계·자주 간 장소는 서버 통계 API
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
          {summary}
          <AppText variant="label1">{t('history.mostVisited', { place: journey.stops[journey.stops.length - 1].placeName, count: 14 })}</AppText>
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
                <View style={styles.flex}>
                  <AppText variant="body2Bold">{stop.placeName ?? stop.address}</AppText>
                  {stop.placeName ? (
                    <AppText variant="label1" color={colors.textSecondary}>
                      {stop.address}
                    </AppText>
                  ) : null}
                </View>
                <AppText variant="label2" color={colors.textSecondary}>
                  {new Date(stop.arrivedAt).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })}
                </AppText>
              </View>
            ))}
          </Pressable>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  tabs: { paddingHorizontal: layout.screenPadding, paddingVertical: 8 },
  loading: { marginTop: 40 },
  list: { paddingHorizontal: layout.screenPadding, paddingBottom: 24, gap: 12 },
  empty: { paddingVertical: 48 },
  sectionHeader: { marginTop: 12, marginBottom: 4 },
  eventCard: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20, borderRadius: radius.md, backgroundColor: colors.surface },
  eventSos: { backgroundColor: '#F9D3CE' },
  eventIcon: { width: 50, height: 50 },
  eventTexts: { flex: 1, gap: 12 },
  placeHeader: { gap: 12, paddingVertical: 12 },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  visited: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  pinIcon: { width: 28, height: 28 },
  dayBlock: { gap: 12 },
  stopsCard: { borderRadius: radius.md, backgroundColor: colors.surface, paddingVertical: 8, paddingHorizontal: 20 },
  stop: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
});
