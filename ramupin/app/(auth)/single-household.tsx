import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, View } from 'react-native';

import { authApi, authErrorOf } from '@/api/endpoints/auth';
import { Button } from '@/components/ui';
import { getDeviceInput } from '@/features/auth/device';
import { applyLoginResult } from '@/features/auth/session';
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
      if (!signUp.gender || !signUp.nickname) {
        // 개발용으로 가입을 건너뛰고 들어온 경우
        updateUser({ singleHouseholdMode: singleHousehold });
        completeOnboarding();
        return;
      }
      const result = await authApi.completeSignUp({
        signUpToken: signUp.signUpToken,
        nickname: signUp.nickname,
        gender: signUp.gender,
        birthDate: signUp.birthDate,
        agreedTerms: signUp.agreedTerms,
        singleHousehold,
        device: await getDeviceInput(),
      });
      // 가입 완료 → 로그인 상태가 되어 루트 레이아웃이 (app) 으로 전환
      await applyLoginResult(result);
    } catch (e) {
      const code = authErrorOf(e)?.code;
      if (code === 'SIGN_UP_TOKEN_INVALID' || code === 'PHONE_NOT_VERIFIED') {
        showToast(t('onboarding.signUpExpired'));
        signUp.reset();
        router.replace('/start');
        return;
      }
      showToast(t(code === 'NICKNAME_TAKEN' ? 'profileEdit.taken' : 'onboarding.signUpFailed'));
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
