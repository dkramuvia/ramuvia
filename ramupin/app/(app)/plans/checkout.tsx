import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { billingApi } from '@/api/endpoints/billing';
import { AppText, Avatar, Button, Screen, TermsAgreement, requiredAgreed, type TermItem } from '@/components/ui';
import { useGroup } from '@/features/groups/queries';
import { BillingToggle } from '@/features/plans/BillingToggle';
import { PlanCard } from '@/features/plans/PlanCard';
import { PLANS } from '@/features/plans/planCatalog';
import { useAuthStore } from '@/stores/authStore';
import { colors, radius } from '@/theme';
import type { PlanId } from '@/types/models';
import { showToast } from '@/utils/toast';

// TODO(9단계): 약관 본문은 확정된 약관 URL 로 교체
const TERMS: TermItem[] = [
  { key: 'service', label: '서비스 이용약관 동의', required: true, body: '서비스 이용약관 본문 (확정 전)' },
  { key: 'privacy', label: '개인정보 수집 및 이용 동의', required: true, body: '개인정보 수집 및 이용 동의 본문 (확정 전)' },
];

/**
 * 피그마: 결제 정보 (283:39554 / 동의 283:39716 / 결제창 283:39874)
 * params: planId (개인 구독) 또는 groupId (그룹 프리미엄), yearly
 */
export default function CheckoutScreen() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ planId?: PlanId; groupId?: string; yearly?: string }>();
  const updateUser = useAuthStore((s) => s.updateUser);
  const { data: group } = useGroup(params.groupId ?? '');

  const [yearly, setYearly] = useState(params.yearly !== '0');
  const [agreed, setAgreed] = useState<string[]>([]);
  const [paying, setPaying] = useState(false);

  const isGroup = !!params.groupId;
  const personal = PLANS.find((p) => p.id === params.planId) ?? PLANS[1];
  const card = isGroup
    ? {
        name: t('plans.groupPlanName'),
        popular: true,
        colors: ['#F48FD8', '#8F7BFF'] as [string, string],
        frame: '#E6D3FF',
        bullets: [t('plans.groupBullets1'), t('plans.groupBullets2'), t('plans.groupBullets3'), t('plans.groupBullets4')],
      }
    : personal;

  const today = new Date();
  const pay = async () => {
    setPaying(true);
    try {
      const result = await billingApi.purchase(
        isGroup ? { kind: 'groupPremium', groupId: params.groupId!, yearly } : { kind: 'plan', planId: personal.id, yearly },
      );
      if (result.planId) updateUser({ plan: result.planId });
      showToast(t('plans.done', { name: card.name }));
      router.dismissTo(isGroup ? `/groups/${params.groupId}/settings` : '/settings/menu');
    } catch (e) {
      showToast(String(e instanceof Error ? e.message : e));
    } finally {
      setPaying(false);
    }
  };

  return (
    <Screen
      title={t('plans.checkoutTitle')}
      contentStyle={styles.content}
      footer={<Button label={t('plans.pay')} size="lg" shape="rounded" disabled={!requiredAgreed(TERMS, agreed) || paying} onPress={pay} />}
    >
      <View style={styles.section}>
        <AppText variant="body2Bold">{t('plans.billingPlan')}</AppText>
        <BillingToggle yearly={yearly} onChange={setYearly} labels={[t('plans.monthly'), t('plans.yearly')]} />
      </View>

      <View style={styles.cardWrap}>
        <PlanCard plan={card} yearly={yearly} width={width - 60} />
      </View>

      {isGroup && group ? (
        <View style={styles.section}>
          <AppText variant="body2Bold">{t('plans.benefitMembers')}</AppText>
          <View style={styles.members}>
            {group.members.map((m) => (
              <View key={m.id} style={styles.member}>
                <Avatar name={m.nickname} imageUrl={m.avatarUrl} />
                <AppText variant="label2" numberOfLines={1}>
                  {m.nickname}
                </AppText>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.terms}>
        <TermsAgreement title={t('plans.termsTitle')} items={TERMS} checked={agreed} onChange={setAgreed} />
        <View style={styles.billingRow}>
          <AppText variant="label2" color={colors.textSecondary} style={styles.flex}>
            {yearly
              ? t('plans.billingDayYearly', { date: today.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' }) })
              : t('plans.billingDay', { day: today.getDate() })}
          </AppText>
          {/* TODO(9단계): 환불 규정 페이지 */}
          <Pressable accessibilityRole="link" hitSlop={6}>
            <AppText variant="label2" color={colors.textSecondary} style={styles.underline}>
              {t('plans.refundPolicy')}
            </AppText>
          </Pressable>
        </View>
        <AppText variant="caption" color={colors.textTertiary}>
          {t('plans.storeNotice')}
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 24 },
  flex: { flex: 1 },
  section: { gap: 12 },
  cardWrap: { alignItems: 'center' },
  members: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: radius.md, backgroundColor: colors.surfaceStrong, padding: 12, rowGap: 12 },
  member: { width: '33%', alignItems: 'center', gap: 4 },
  terms: { gap: 12, borderRadius: 20, backgroundColor: colors.white, padding: 16 },
  billingRow: { flexDirection: 'row', alignItems: 'center' },
  underline: { textDecorationLine: 'underline' },
});
