import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui';
import { BillingToggle } from '@/features/plans/BillingToggle';
import { PlanCard } from '@/features/plans/PlanCard';
import { COMPARE_ROWS, PLANS } from '@/features/plans/planCatalog';
import { useAuthStore } from '@/stores/authStore';
import { makeStyles } from '@/theme';

const CARD_GAP = 16;

/**
 * 피그마: 구독 플랜 (283:40073 ~ 283:41302)
 * 기획: 좌우로 넘겨서 다음 플랜, 아래 칩으로 플랜 선택, 플랜별 비교표
 * WBS 3.4: 결제는 App Store / Play Store 인앱결제만 (7단계에서 연동)
 */
export default function PlansScreen() {
  const styles = useStyles();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const me = useAuthStore((s) => s.user);
  const [yearly, setYearly] = useState(true);
  const [index, setIndex] = useState(Math.max(0, PLANS.findIndex((p) => p.popular)));
  const listRef = useRef<FlatList>(null);

  const cardWidth = width - 72;
  const plan = PLANS[index];

  const select = (i: number) => {
    setIndex(i);
    listRef.current?.scrollToOffset({ offset: i * (cardWidth + CARD_GAP), animated: true });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={INK} />
        </Pressable>
        <AppText variant="body1Bold" color={INK}>
          {t('screens.plans')}
        </AppText>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* 3차 리포트: 무료 등급에는 결제 조건(매달/연간)을 보이지 않습니다. 자리는 남겨 카드가 들썩이지 않게 */}
        <View style={[styles.toggle, plan.free && styles.hidden]} pointerEvents={plan.free ? 'none' : 'auto'}>
          <BillingToggle yearly={yearly} onChange={setYearly} dark />
        </View>

        <FlatList
          ref={listRef}
          data={PLANS}
          horizontal
          keyExtractor={(p) => p.id}
          showsHorizontalScrollIndicator={false}
          snapToInterval={cardWidth + CARD_GAP}
          decelerationRate="fast"
          contentContainerStyle={{ paddingHorizontal: 36, gap: CARD_GAP }}
          initialScrollIndex={index}
          getItemLayout={(_, i) => ({ length: cardWidth + CARD_GAP, offset: (cardWidth + CARD_GAP) * i, index: i })}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / (cardWidth + CARD_GAP)))}
          renderItem={({ item }) => {
            const current = me?.plan === item.id;
            return (
              <PlanCard
                plan={item}
                yearly={yearly}
                width={cardWidth}
                actionLabel={current ? t('plans.current') : item.free ? t('plans.freePlan') : t('plans.choose')}
                actionDisabled={current || item.free}
                onAction={() => router.push({ pathname: '/plans/checkout', params: { planId: item.id, yearly: yearly ? '1' : '0' } })}
              />
            );
          }}
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {PLANS.map((p, i) => {
            const on = i === index;
            return (
              <Pressable
                key={p.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => select(i)}
                style={[styles.chip, on && { backgroundColor: '#FD8B6730', borderColor: '#FD916B' }]}
              >
                <AppText variant="label1Bold" color={on ? '#FD916B' : '#74818B'}>
                  {p.name}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={[styles.table, { backgroundColor: plan.tint }]}>
          <AppText variant="body1Bold" color={plan.accent} style={styles.tableHead}>
            {`${plan.name} (${plan.englishName})`}
          </AppText>
          {COMPARE_ROWS.map((row) => {
            const value = row.value(plan.id);
            return (
              <View key={row.label} style={styles.tableRow}>
                <AppText variant="label1Bold" color={INK} style={styles.flex}>
                  {row.label}
                </AppText>
                <View style={styles.tableValue}>
                  {typeof value === 'boolean' ? (
                    <Ionicons name={value ? 'checkmark' : 'close'} size={20} color={value ? '#2DB400' : '#F04438'} />
                  ) : (
                    <AppText variant="label1Bold" color={VALUE}>
                      {value}
                    </AppText>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {plan.free ? null : (
          <Pressable accessibilityRole="button" onPress={() => router.push('/plans/free-trial')} style={styles.trialLink}>
            <AppText variant="label1" color={INK}>
              {t('plans.freeTrialLink')}
            </AppText>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * 피그마 v3.1 구독 플랜 (7091:77020 ~ 7091:77752): 밝은 바탕, 등급 색 카드, 등급 색 비교표.
 * 카드와 표 바탕은 테마와 상관없이 늘 밝은 색이라 그 위 글자도 고정 색입니다.
 */
const INK = '#1D2127';
const VALUE = '#6B747C';

const useStyles = makeStyles(() => ({
  container: { flex: 1, backgroundColor: '#FBFAF9' },
  flex: { flex: 1 },
  header: { height: 48, alignItems: 'center', justifyContent: 'center' },
  back: { position: 'absolute', left: 12 },
  content: { paddingBottom: 40, gap: 20 },
  toggle: { marginHorizontal: 42, marginTop: 8 },
  hidden: { opacity: 0 },
  chips: { marginHorizontal: 16, paddingHorizontal: 12, paddingVertical: 6, gap: 4, borderRadius: 50, backgroundColor: '#FFFFFF' },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 50, borderWidth: 1, borderColor: 'transparent' },
  table: { marginHorizontal: 16, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
  tableHead: { marginLeft: '50%', marginBottom: 8 },
  tableRow: { flexDirection: 'row', alignItems: 'center', minHeight: 32 },
  tableValue: { width: '50%' },
  trialLink: { alignSelf: 'center', padding: 8 },
}));
