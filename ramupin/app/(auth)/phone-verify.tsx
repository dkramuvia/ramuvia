import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';

import { authApi } from '@/api/endpoints/auth';
import { AppText, Button, TextField } from '@/components/ui';
import { OnboardingLayout } from '@/features/onboarding/OnboardingLayout';
import { useSignUpStore } from '@/stores/signUpStore';
import { colors, radius } from '@/theme';

/** "01092491760" → "010-9249-1760" */
function formatPhone(text: string) {
  const d = text.replace(/\D/g, '').slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

const mmss = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

/**
 * 피그마: 휴대폰 인증 (348:15108 → 요청 348:15122 → 오류 348:15155 → 완료 348:15170)
 * WBS 3.5 SMS 인증, 3.7 번호 중복 가입 확인 (서버)
 */
export default function PhoneVerifyScreen() {
  const { t } = useTranslation();
  const setSignUp = useSignUpStore((s) => s.set);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [remaining, setRemaining] = useState(0);
  const [requested, setRequested] = useState(false);
  const [sentBanner, setSentBanner] = useState(false);
  const [error, setError] = useState<string>();
  const [verified, setVerified] = useState(false);
  const codeRef = useRef<TextInput>(null);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setTimeout(() => setRemaining((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);

  const phoneDigits = phone.replace(/\D/g, '');
  const phoneValid = /^01[016789]\d{7,8}$/.test(phoneDigits);

  const request = async () => {
    setError(undefined);
    setCode('');
    setVerified(false);
    const result = await authApi.requestSmsCode(phoneDigits);
    if (result.alreadyRegistered) {
      setError(t('onboarding.alreadyRegistered'));
      return;
    }
    setRequested(true);
    setRemaining(result.expiresInSec);
    setSentBanner(true);
    setTimeout(() => setSentBanner(false), 2500);
    codeRef.current?.focus();
  };

  const onCode = async (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    setError(undefined);
    if (digits.length < 6) return;
    if (remaining <= 0) {
      setError(t('onboarding.codeExpired'));
      return;
    }
    const { verified: ok } = await authApi.verifySmsCode(phoneDigits, digits);
    if (ok) {
      setVerified(true);
      setRemaining(0);
    } else {
      setError(t('onboarding.codeWrong'));
    }
  };

  return (
    <OnboardingLayout
      title={t('onboarding.phoneTitle')}
      footer={
        <Button
          label={t('onboarding.next')}
          size="lg"
          shape="rounded"
          variant={verified ? 'dark' : 'neutral'}
          disabled={!verified}
          onPress={() => {
            setSignUp({ phone: phoneDigits });
            router.push('/terms');
          }}
        />
      }
    >
      <TextField
        label={t('onboarding.phone')}
        placeholder={t('onboarding.phonePlaceholder')}
        value={phone}
        onChangeText={(v) => {
          setPhone(formatPhone(v));
          setRequested(false);
          setVerified(false);
        }}
        keyboardType="phone-pad"
        editable={!verified}
        errorText={!requested ? error : undefined}
        right={
          !requested ? (
            <Button label={t('onboarding.requestCode')} variant="soft" size="xs" shape="square" disabled={!phoneValid} onPress={request} />
          ) : undefined
        }
      />

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
          editable={!verified}
          errorText={error}
          helperText={verified ? t('onboarding.verified') : __DEV__ ? t('onboarding.devCodeHint') : undefined}
          right={
            verified ? (
              <Ionicons name="checkmark-circle" size={24} color={colors.check} />
            ) : (
              <View style={styles.right}>
                <AppText variant="label1" color={remaining > 0 ? colors.textStrong : colors.danger}>
                  {mmss(remaining)}
                </AppText>
                <Button label={t('onboarding.resend')} variant="soft" size="xs" shape="square" onPress={request} />
              </View>
            )
          }
        />
      ) : null}

      {sentBanner ? (
        <View style={styles.banner}>
          <Ionicons name="checkmark-circle-outline" size={22} color={colors.textStrong} />
          <AppText variant="label1Bold">{t('onboarding.codeSent')}</AppText>
        </View>
      ) : null}
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  banner: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: '#473C39',
    backgroundColor: colors.white,
  },
});
