import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { authApi, authErrorOf, type SocialProvider } from '@/api/endpoints/auth';
import { AppText } from '@/components/ui';
import { env, isLive } from '@/config/env';
import { getDeviceInput } from '@/features/auth/device';
import { signInWithKakao } from '@/features/auth/kakao';
import { applyLoginResult } from '@/features/auth/session';
import { devServerLogin } from '@/features/auth/useDevServerSession';
import { OnboardingLayout } from '@/features/onboarding/OnboardingLayout';
import { useAuthStore } from '@/stores/authStore';
import { colors, radius } from '@/theme';
import { showToast } from '@/utils/toast';

type IconName = ComponentProps<typeof Ionicons>['name'];

const PROVIDERS: { id: SocialProvider; label: string; icon: ReactNode }[] = [
  { id: 'x', label: 'X', icon: <Ionicons name={'logo-x' as IconName} size={24} color={colors.black} /> },
  { id: 'facebook', label: 'Facebook', icon: <Ionicons name="logo-facebook" size={26} color="#1877F2" /> },
  { id: 'google', label: 'Google', icon: <Ionicons name="logo-google" size={24} color="#EA4335" /> },
  { id: 'apple', label: 'Apple', icon: <Ionicons name="logo-apple" size={26} color={colors.black} /> },
  { id: 'instagram', label: 'Instagram', icon: <Ionicons name="logo-instagram" size={26} color="#E1306C" /> },
];

/**
 * 피그마: 가입/로그인 선택 (348:14951)
 * TODO(5단계 마지막): 각 소셜 SDK 연결. 지금은 목업 토큰으로 서버 흐름만 진행
 */
export default function WelcomeScreen() {
  const { t } = useTranslation();
  const signIn = useAuthStore((s) => s.signIn);
  const completeOnboarding = useAuthStore((s) => s.completeOnboarding);
  const [pending, setPending] = useState(false);

  const login = async (provider: SocialProvider) => {
    if (provider === 'kakao' && isLive('auth')) return loginWithKakao();
    try {
      // TODO(로그인 단계): 나머지 소셜 SDK 연결. 지금은 목업
      const result = await authApi.socialLogin(provider, 'mock-token');
      signIn(result.accessToken, result.user);
      if (result.isNewUser) router.push('/profile-setup');
      else completeOnboarding();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    }
  };

  /** 카카오톡(없으면 카카오계정)으로 로그인 → 서버 확인 → 신규면 가입 화면 */
  const loginWithKakao = async () => {
    if (pending) return;
    setPending(true);
    try {
      const kakaoToken = await signInWithKakao();
      const outcome = await applyLoginResult(await authApi.kakaoLogin(kakaoToken, await getDeviceInput()));
      if (outcome === 'sign-up') router.push('/profile-setup');
      else if (outcome === 'device-verification') router.push('/device-verify');
    } catch (e) {
      // 사용자가 카카오 로그인 창을 닫으면 취소 오류가 옵니다
      const message = e instanceof Error ? e.message : String(e);
      if (__DEV__) console.warn('[kakao] 실패', message, JSON.stringify(authErrorOf(e) ?? {}));
      if (!/cancel/i.test(message)) showToast(t('onboarding.kakaoFailed'));
    } finally {
      setPending(false);
    }
  };

  // 개발용: 서버 연결(auth)이 켜져 있으면 서버 개발용 로그인 (다른 기기에서 쓰던 계정이면 새 기기 인증 화면)
  const devSkip = async () => {
    if (!isLive('auth')) {
      await login('google');
      completeOnboarding();
      return;
    }
    try {
      const outcome = await devServerLogin();
      if (outcome === 'device-verification') router.push('/device-verify');
      else if (outcome === 'sign-up') router.push('/profile-setup');
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <OnboardingLayout showBack={false}>
      <View style={styles.hero}>
        <AppText variant="title2" color={colors.textSecondary} style={styles.heroText}>
          {t('onboarding.welcomeTitle')}
        </AppText>
        <Image source={require('../../assets/images/qr-deco-cloud.png')} style={styles.cloud} />
        <Image source={require('../../assets/images/qr-deco-r.png')} style={styles.r} />
      </View>

      <View style={styles.buttons}>
        {PROVIDERS.map((p) => (
          <Pressable key={p.id} accessibilityRole="button" onPress={() => login(p.id)} style={({ pressed }) => [styles.social, pressed && styles.pressed]}>
            <View style={styles.socialIcon}>{p.icon}</View>
            <AppText variant="body1">{t('onboarding.signUpWith', { provider: p.label })}</AppText>
          </Pressable>
        ))}
      </View>

      <View style={styles.orRow}>
        <View style={styles.line} />
        <AppText variant="caption" color={colors.textMuted}>
          {t('onboarding.or')}
        </AppText>
        <View style={styles.line} />
      </View>

      <View style={styles.koreanRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="카카오로 가입하기" onPress={() => login('kakao')}>
          <Image source={require('../../assets/icons/login-kakao.png')} style={styles.round} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="네이버로 가입하기" onPress={() => login('naver')}>
          <Image source={require('../../assets/icons/login-naver.png')} style={styles.round} />
        </Pressable>
      </View>

      <View style={styles.loginRow}>
        <AppText variant="caption">{t('onboarding.haveAccount')}</AppText>
        <Pressable accessibilityRole="button" onPress={() => login('google')} hitSlop={8}>
          <AppText variant="caption" color={colors.brown}>
            {t('onboarding.login')}
          </AppText>
        </Pressable>
      </View>

      {env.devSkipAuth || __DEV__ ? (
        <Pressable accessibilityRole="button" onPress={devSkip} style={styles.devSkip}>
          <AppText variant="caption" color={colors.textMuted}>
            {t('onboarding.devSkip')}
          </AppText>
        </Pressable>
      ) : null}
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  hero: { height: 210 },
  heroText: { paddingTop: 16 },
  cloud: { position: 'absolute', left: 60, bottom: -10, width: 200, height: 134 },
  r: { position: 'absolute', right: 30, top: 50, width: 120, height: 120 },
  buttons: { gap: 12 },
  social: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 22,
    borderRadius: radius.full,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.borderLight,
    elevation: 2,
    shadowColor: colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  pressed: { opacity: 0.7 },
  socialIcon: { width: 28, alignItems: 'center' },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8 },
  line: { flex: 1, height: 1, backgroundColor: '#B8C4C4' },
  koreanRow: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  round: { width: 60, height: 60, borderRadius: 30 },
  loginRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingTop: 16 },
  devSkip: { alignSelf: 'center', padding: 8 },
});
