import { router } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, StyleSheet, View } from 'react-native';

import { AppText, Button, TermsAgreement, requiredAgreed, type TermItem } from '@/components/ui';
import { OnboardingLayout } from '@/features/onboarding/OnboardingLayout';
import { useSignUpStore } from '@/stores/signUpStore';
import { useColors } from '@/theme';

/**
 * 피그마: 약관 동의 (348:15195 / 전체 동의 348:15242). WBS: 위치기반서비스 약관 필수 (위치정보법)
 *
 * 대표 리포트 3차(가입 순서가 피그마와 다름): 피그마 v3.1 순서대로
 * 로그인 방식 → **약관** → 휴대폰 인증 → 프로필(닉네임·생년월일·성별) → (만 14세 미만 보호자 동의) → 권한 → 1인 가구.
 */
export default function TermsScreen() {
  const colors = useColors();
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

  /**
   * 가입 첫 화면입니다. 가입 중에 앱을 다시 켜면 곧바로 이 화면이 열려 앞 화면이 없는데,
   * 그때 뒤로 가기는 가입을 그만두고 로그인 화면으로 갑니다 (다른 계정으로 로그인할 길)
   */
  const back = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    useSignUpStore.getState().reset();
    router.replace('/welcome');
  }, []);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      back();
      return true;
    });
    return () => sub.remove();
  }, [back]);

  return (
    <OnboardingLayout
      onBack={back}
      title={t('onboarding.termsTitle')}
      footer={
        <Button
          label={t('onboarding.next')}
          size="lg"
          shape="rounded"
          variant={canNext ? 'dark' : 'neutral'}
          disabled={!canNext}
          onPress={() => router.push('/phone-verify')}
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
