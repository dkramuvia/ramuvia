import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, View } from 'react-native';

import { authApi } from '@/api/endpoints/auth';
import { Button } from '@/components/ui';
import { OnboardingLayout } from '@/features/onboarding/OnboardingLayout';
import { useAuthStore } from '@/stores/authStore';
import { useSignUpStore } from '@/stores/signUpStore';
import { colors } from '@/theme';
import { showToast } from '@/utils/toast';

/**
 * 피그마: 1인 가구 여부 (348:15460)
 * WBS 4: 1인 가구 등록 시 친구가 없으면 회사 계정(RamuVia)이 친구가 됨 (서버)
 */
export default function SingleHouseholdScreen() {
  const { t } = useTranslation();
  const signUp = useSignUpStore();
  const updateUser = useAuthStore((s) => s.updateUser);
  const completeOnboarding = useAuthStore((s) => s.completeOnboarding);
  const [pending, setPending] = useState(false);

  const finish = async (singleHousehold: boolean) => {
    setPending(true);
    try {
      if (signUp.gender && signUp.nickname) {
        const user = await authApi.completeSignUp({
          nickname: signUp.nickname,
          gender: signUp.gender,
          birthDate: signUp.birthDate,
          phone: signUp.phone,
          agreedTerms: signUp.agreedTerms,
          singleHousehold,
        });
        updateUser(user);
      } else {
        updateUser({ singleHouseholdMode: singleHousehold });
      }
      signUp.reset();
      // 로그인 완료 → 루트 레이아웃이 (app) 으로 전환
      completeOnboarding();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
      setPending(false);
    }
  };

  return (
    <OnboardingLayout title={t('onboarding.singleTitle')}>
      <View style={styles.art}>
        <Image source={require('../../assets/images/single-household-off.png')} style={styles.image} resizeMode="contain" />
      </View>
      <View style={styles.buttons}>
        <Button label={t('onboarding.singleYes')} variant="white" size="lg" shape="rounded" disabled={pending} onPress={() => finish(true)} style={styles.option} />
        <Button label={t('onboarding.singleNo')} variant="white" size="lg" shape="rounded" disabled={pending} onPress={() => finish(false)} style={styles.option} />
      </View>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  art: { alignItems: 'center', paddingVertical: 48 },
  image: { width: 240, height: 240 },
  buttons: { gap: 16 },
  option: { borderWidth: 1.5, borderColor: colors.surfaceStrong, backgroundColor: '#FAF8F6' },
});
