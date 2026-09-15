import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, TermsAgreement, requiredAgreed, type TermItem } from '@/components/ui';
import { OnboardingLayout } from '@/features/onboarding/OnboardingLayout';
import { useSignUpStore } from '@/stores/signUpStore';
import { colors } from '@/theme';

/** 피그마: 약관 동의 (348:15195 / 전체 동의 348:15242). WBS: 위치기반서비스 약관 필수 (위치정보법) */
export default function TermsScreen() {
  const { t } = useTranslation();
  const agreed = useSignUpStore((s) => s.agreedTerms);
  const set = useSignUpStore((s) => s.set);

  // TODO(9단계): 확정된 약관 URL/본문으로 교체
  const terms: TermItem[] = [
    { key: 'service', label: t('onboarding.termService'), required: true, body: '서비스 이용약관 (확정 전)' },
    { key: 'location', label: t('onboarding.termLocation'), required: true, body: '위치기반서비스 이용약관 (확정 전)' },
    { key: 'privacy', label: t('onboarding.termPrivacy'), required: true, body: '개인정보 수집 및 이용 동의 (확정 전)' },
    { key: 'marketing', label: t('onboarding.termMarketing'), required: false, body: '마케팅 정보 수신 동의 (선택)' },
  ];
  const canNext = requiredAgreed(terms, agreed);

  return (
    <OnboardingLayout
      title={t('onboarding.termsTitle')}
      footer={
        <Button
          label={t('onboarding.next')}
          size="lg"
          shape="rounded"
          variant={canNext ? 'dark' : 'neutral'}
          disabled={!canNext}
          onPress={() => router.push('/permissions')}
        />
      }
    >
      <View style={styles.box}>
        <AppText variant="body2" color={colors.textSecondary}>
          {t('onboarding.termsSubtitle')}
        </AppText>
        <TermsAgreement items={terms} checked={agreed} onChange={(agreedTerms) => set({ agreedTerms })} />
      </View>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  box: { gap: 16, paddingTop: 24 },
});
