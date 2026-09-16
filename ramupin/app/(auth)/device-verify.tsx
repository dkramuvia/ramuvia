import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';

import { authApi, authErrorOf } from '@/api/endpoints/auth';
import { AppText, Button, TextField } from '@/components/ui';
import { applyLoginResult } from '@/features/auth/session';
import { OnboardingLayout } from '@/features/onboarding/OnboardingLayout';
import { useAuthStore } from '@/stores/authStore';
import { colors } from '@/theme';

const mmss = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

/**
 * 새 기기 로그인 문자 인증 (기기 1대 로그인 규칙, 대표 요청).
 * 피그마 시안이 없어 휴대폰 인증(348:15108) 화면 구성을 따릅니다.
 */
export default function DeviceVerifyScreen() {
  const { t } = useTranslation();
  const challengeId = useAuthStore((s) => s.pendingDeviceVerification?.challengeId);
  const [phoneMasked, setPhoneMasked] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  /** 처음부터 다시 로그인해야 하는 오류 */
  const [fatal, setFatal] = useState<string>();
  const [pending, setPending] = useState(false);
  const codeRef = useRef<TextInput>(null);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setTimeout(() => setRemaining((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);

  const restart = () => {
    useAuthStore.getState().setPendingDeviceVerification(null);
    router.replace('/start');
  };

  const handleError = (e: unknown) => {
    const body = authErrorOf(e);
    switch (body?.code) {
      case 'CHALLENGE_EXPIRED':
        setFatal(t('session.challengeExpired'));
        break;
      case 'CODE_ATTEMPTS_EXCEEDED':
        setFatal(t('session.attemptsExceeded'));
        break;
      case 'CODE_INVALID':
        setError(t('session.codeWrongLeft', { count: body.remainingAttempts ?? 0 }));
        break;
      case 'CODE_EXPIRED':
        setError(t('onboarding.codeExpired'));
        break;
      case 'SMS_TOO_SOON':
        setError(t('session.tooSoon', { sec: body.retryAfterSec ?? 30 }));
        break;
      case 'SMS_LIMIT':
        setError(t('session.smsLimit'));
        break;
      default:
        setError(t('session.failed'));
    }
  };

  const request = async () => {
    if (!challengeId) return;
    setError(undefined);
    setCode('');
    try {
      const result = await authApi.sendDeviceCode(challengeId);
      setPhoneMasked(result.phoneMasked);
      setRequested(true);
      setRemaining(result.codeExpiresInSec);
      codeRef.current?.focus();
    } catch (e) {
      handleError(e);
    }
  };

  const verify = async (value: string) => {
    if (!challengeId) return;
    setPending(true);
    try {
      // 성공하면 로그인 상태가 되어 앱 화면으로 자동 이동
      await applyLoginResult(await authApi.verifyDeviceCode(challengeId, value));
    } catch (e) {
      setCode('');
      handleError(e);
    } finally {
      setPending(false);
    }
  };

  const onCode = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    setError(undefined);
    if (digits.length === 6) verify(digits);
  };

  if (!challengeId || fatal) {
    return (
      <OnboardingLayout
        title={t('session.deviceTitle')}
        showBack={false}
        footer={<Button label={t('session.restart')} size="lg" shape="rounded" variant="dark" onPress={restart} />}
      >
        <AppText variant="body2" color={colors.danger}>
          {fatal ?? t('session.challengeExpired')}
        </AppText>
      </OnboardingLayout>
    );
  }

  return (
    <OnboardingLayout
      title={t('session.deviceTitle')}
      showBack={false}
      footer={
        requested ? (
          <Button
            label={t('session.confirm')}
            size="lg"
            shape="rounded"
            variant={code.length === 6 ? 'dark' : 'neutral'}
            disabled={code.length < 6 || pending}
            onPress={() => verify(code)}
          />
        ) : (
          <Button label={t('session.requestCode')} size="lg" shape="rounded" variant="dark" onPress={request} />
        )
      }
    >
      <View style={styles.notice}>
        <Ionicons name="phone-portrait-outline" size={22} color={colors.textStrong} />
        <AppText variant="body2" style={styles.flex}>
          {t('session.deviceDesc')}
        </AppText>
      </View>

      <AppText variant="label1">{phoneMasked ? t('session.sendTo', { phone: phoneMasked }) : t('session.sendToRegistered')}</AppText>

      {requested ? (
        <TextField
          ref={codeRef}
          label={t('onboarding.code')}
          placeholder={t('onboarding.codePlaceholder')}
          value={code}
          onChangeText={onCode}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          editable={!pending}
          errorText={error}
          helperText={__DEV__ ? t('onboarding.devCodeHint') : undefined}
          right={
            <View style={styles.right}>
              <AppText variant="label1" color={remaining > 0 ? colors.textStrong : colors.danger}>
                {mmss(remaining)}
              </AppText>
              <Button label={t('onboarding.resend')} variant="soft" size="xs" shape="square" onPress={request} />
            </View>
          }
        />
      ) : error ? (
        <AppText variant="label1" color={colors.danger}>
          {error}
        </AppText>
      ) : null}
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  notice: { flexDirection: 'row', gap: 12, padding: 16, borderRadius: 10, backgroundColor: colors.white },
  flex: { flex: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
