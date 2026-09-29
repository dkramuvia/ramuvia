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
import { SocialAuthCancelled, signInWithGoogle, signInWithNaver, signInWithX } from '@/features/auth/social';
import { applyLoginResult } from '@/features/auth/session';
import { devServerLogin } from '@/features/auth/useDevServerSession';
import { OnboardingLayout } from '@/features/onboarding/OnboardingLayout';
import { useAuthStore } from '@/stores/authStore';
import { makeStyles, radius, useColors } from '@/theme';
import { showToast } from '@/utils/toast';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** X·Apple 로고의 검정. 다크 모드에서도 로고 색은 그대로입니다 */
const BRAND_BLACK = '#000000';

/**
 * Instagram 은 빠져 있습니다 — 일반 사용자 로그인 API 가 종료되어 더 이상 쓸 수 없습니다
 * (docs/wbs-check.md 2-6). 대표님 확인 뒤 피그마에서도 빼는 것이 좋겠습니다.
 */
const PROVIDERS: { id: SocialProvider; label: string; icon: ReactNode }[] = [
  // 소셜 로고 색은 각 회사가 정한 것이라 테마를 따라가지 않습니다
  { id: 'x', label: 'X', icon: <Ionicons name={'logo-x' as IconName} size={24} color={BRAND_BLACK} /> },
  { id: 'facebook', label: 'Facebook', icon: <Ionicons name="logo-facebook" size={26} color="#1877F2" /> },
  { id: 'google', label: 'Google', icon: <Ionicons name="logo-google" size={24} color="#EA4335" /> },
  { id: 'apple', label: 'Apple', icon: <Ionicons name="logo-apple" size={26} color={BRAND_BLACK} /> },
];

/** 브라우저에서 인가 코드를 받아 오는 제공자들. 토큰 교환은 서버가 합니다 */
const CODE_LOGINS = {
  x: signInWithX,
  naver: signInWithNaver,
  google: signInWithGoogle,
} as const;

/**
 * 아직 붙이지 않은 제공자.
 * Apple 은 iOS 단계(3단계), Facebook 은 앱 등록·검수가 끝나야 붙일 수 있습니다.
 * 누르면 아무 일도 안 일어나거나 오류가 나는 것보다, 준비 중이라고 알려 주는 편이 낫습니다.
 */
const NOT_READY: Partial<Record<SocialProvider, string>> = {
  apple: 'onboarding.appleLater',
  facebook: 'onboarding.notReady',
  instagram: 'onboarding.notReady',
};

const PROVIDER_LABELS: Record<keyof typeof CODE_LOGINS, string> = { x: 'X', naver: '네이버', google: '구글' };

/** 피그마: 가입/로그인 선택 (348:14951) */
export default function WelcomeScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const signIn = useAuthStore((s) => s.signIn);
  const completeOnboarding = useAuthStore((s) => s.completeOnboarding);
  const [pending, setPending] = useState(false);

  const login = async (provider: SocialProvider) => {
    if (isLive('auth')) {
      if (provider === 'kakao') return loginWithKakao();
      if (provider in CODE_LOGINS) return loginWithCode(provider as keyof typeof CODE_LOGINS);
      return showToast(t(NOT_READY[provider] ?? 'onboarding.notReady'));
    }
    try {
      // 목업 단계: 서버 없이 화면 흐름만 확인합니다
      const result = await authApi.socialLogin(provider, 'mock-token');
      signIn(result.accessToken, result.user);
      if (result.isNewUser) router.push('/profile-setup');
      else completeOnboarding();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    }
  };

  /** X·네이버·구글: 브라우저에서 인가 코드를 받아 서버가 토큰으로 바꿉니다 */
  const loginWithCode = async (provider: keyof typeof CODE_LOGINS) => {
    if (pending) return;
    setPending(true);
    try {
      const auth = await CODE_LOGINS[provider]();
      const outcome = await applyLoginResult(await authApi.codeLogin(provider, auth, await getDeviceInput()));
      if (outcome === 'sign-up') router.push('/profile-setup');
      else if (outcome === 'device-verification') router.push('/device-verify');
    } catch (e) {
      if (e instanceof SocialAuthCancelled) return;
      const message = e instanceof Error ? e.message : String(e);
      if (__DEV__) console.warn(`[${provider}] 실패`, message, JSON.stringify(authErrorOf(e) ?? {}));
      showToast(t('onboarding.socialFailed', { provider: PROVIDER_LABELS[provider] }));
    } finally {
      setPending(false);
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

const useStyles = makeStyles((colors) => ({
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
    backgroundColor: colors.card,
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
}));
