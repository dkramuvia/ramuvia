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
import { colors } from '@/theme';

const CARD_GAP = 16;

/**
 * 피그마: 구독 플랜 (283:40073 ~ 283:41302)
 * 기획: 좌우로 넘겨서 다음 플랜, 아래 칩으로 플랜 선택, 플랜별 비교표
 * WBS 3.4: 결제는 App Store / Play Store 인앱결제만 (7단계에서 연동)
 */
export default function PlansScreen() {
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
      <StatusBar style="light" />
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={colors.white} />
        </Pressable>
        <AppText variant="body1Bold" color={colors.white}>
          {t('screens.plans')}
        </AppText>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Ionicons name="calendar" size={40} color={colors.accent} />
          <AppText variant="title4">{t('plans.heroTitle')}</AppText>
          <AppText variant="label1" color={colors.textSecondary}>
            {t('plans.heroDesc')}
          </AppText>
        </View>

        <View style={styles.toggle}>
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
          {PLANS.map((p, i) => (
            <Pressable key={p.id} accessibilityRole="tab" accessibilityState={{ selected: i === index }} onPress={() => select(i)} style={[styles.chip, i === index && styles.chipSelected]}>
              <AppText variant="label1" color={i === index ? '#FF6A4D' : colors.textSecondary}>
                {p.name}
              </AppText>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.table}>
          <AppText variant="label1Bold" color="#FF7F5E" style={styles.tableHead}>
            {plan.name}
          </AppText>
          {COMPARE_ROWS.map((row) => {
            const value = row.value(plan.id);
            return (
              <View key={row.label} style={styles.tableRow}>
                <AppText variant="label1" color="#D0D0D0" style={styles.flex}>
                  {row.label}
                </AppText>
                <View style={styles.tableValue}>
                  {typeof value === 'boolean' ? (
                    value ? <Ionicons name="checkmark" size={20} color={colors.check} /> : <AppText variant="label1Bold" color="#8A8A8A">-</AppText>
                  ) : (
                    <AppText variant="label1Bold" color={colors.white}>
                      {value}
                    </AppText>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        <Pressable accessibilityRole="button" onPress={() => router.push('/plans/free-trial')} style={styles.trialLink}>
          <AppText variant="label1Bold" color={colors.accent}>
            {t('plans.freeTrialLink')}
          </AppText>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#232323' },
  flex: { flex: 1 },
  header: { height: 48, alignItems: 'center', justifyContent: 'center' },
  back: { position: 'absolute', left: 12 },
  content: { paddingBottom: 40, gap: 24 },
  hero: { marginHorizontal: 36, marginTop: 16, borderRadius: 12, backgroundColor: colors.white, padding: 20, gap: 8 },
  toggle: { marginHorizontal: 42 },
  chips: { paddingHorizontal: 28, gap: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: colors.white },
  chipSelected: { backgroundColor: '#FFE7E0', borderWidth: 1, borderColor: '#FF9A76' },
  table: { marginHorizontal: 36, borderRadius: 12, backgroundColor: '#333', padding: 20 },
  tableHead: { marginLeft: '55%', marginBottom: 8 },
  tableRow: { flexDirection: 'row', alignItems: 'center', minHeight: 38 },
  tableValue: { width: '45%' },
  trialLink: { alignSelf: 'center', padding: 8 },
});
