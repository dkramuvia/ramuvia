import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { billingApi } from '@/api/endpoints/billing';
import { AppText, Button, Screen, TermsAgreement, requiredAgreed, type TermItem } from '@/components/ui';
import { BillingToggle } from '@/features/plans/BillingToggle';
import { PlanCard } from '@/features/plans/PlanCard';
import { PLANS } from '@/features/plans/planCatalog';
import { useAuthStore } from '@/stores/authStore';
import { makeStyles, useColors } from '@/theme';
import type { PlanId } from '@/types/models';
import { showToast } from '@/utils/toast';
import { formatDate } from '@/utils/time';

// TODO(9단계): 약관 본문은 확정된 약관 URL 로 교체
const TERMS: TermItem[] = [
  { key: 'service', label: '서비스 이용약관 동의', required: true, body: '서비스 이용약관 본문 (확정 전)' },
  { key: 'privacy', label: '개인정보 수집 및 이용 동의', required: true, body: '개인정보 수집 및 이용 동의 본문 (확정 전)' },
];

/**
 * 피그마: 결제 정보 (283:39554 / 동의 283:39716 / 결제창 283:39874)
 * params: planId, yearly. 그룹 프리미엄은 없앴습니다 (10-26 대표님: 개인 등급 플래티넘·트리니티만)
 */
export default function CheckoutScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ planId?: PlanId; yearly?: string }>();
  const updateUser = useAuthStore((s) => s.updateUser);

  const [yearly, setYearly] = useState(params.yearly !== '0');
  const [agreed, setAgreed] = useState<string[]>([]);
  const [paying, setPaying] = useState(false);

  const card = PLANS.find((p) => p.id === params.planId) ?? PLANS[1];

  const today = new Date();
  const pay = async () => {
    setPaying(true);
    try {
      const result = await billingApi.purchase({ kind: 'plan', planId: card.id, yearly });
      if (result.planId) updateUser({ plan: result.planId });
      showToast(t('plans.done', { name: card.name }));
      router.dismissTo('/settings/menu');
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

      <View style={styles.terms}>
        <TermsAgreement title={t('plans.termsTitle')} items={TERMS} checked={agreed} onChange={setAgreed} />
        <View style={styles.billingRow}>
          <AppText variant="label2" color={colors.textSecondary} style={styles.flex}>
            {yearly
              ? t('plans.billingDayYearly', { date: formatDate(today, 'monthDay') })
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

const useStyles = makeStyles((colors) => ({
  content: { gap: 24 },
  flex: { flex: 1 },
  section: { gap: 12 },
  cardWrap: { alignItems: 'center' },
  terms: { gap: 12, borderRadius: 20, backgroundColor: colors.card, padding: 16 },
  billingRow: { flexDirection: 'row', alignItems: 'center' },
  underline: { textDecorationLine: 'underline' },
}));
