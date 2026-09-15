import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { authApi } from '@/api/endpoints/auth';
import { AppText, Button, SegmentButtons, TextField } from '@/components/ui';
import { OnboardingLayout } from '@/features/onboarding/OnboardingLayout';
import { useSignUpStore } from '@/stores/signUpStore';
import type { Gender } from '@/types/models';

const NICKNAME_RULE = /^[가-힣a-zA-Z0-9]{2,8}$/;
// TODO(정책): 노인 기준 나이는 서버 정책값 (WBS 3.7 "75세 이상, 차후 변경 가능" / 기획 확정 전)
const SENIOR_AGE = 75;

/** "19990713" → "1999 / 07 / 13" */
function formatBirth(digits: string) {
  const d = digits.replace(/\D/g, '').slice(0, 8);
  return [d.slice(0, 4), d.slice(4, 6), d.slice(6, 8)].filter(Boolean).join(' / ');
}

function parseBirth(text: string): Date | null {
  const d = text.replace(/\D/g, '');
  if (d.length !== 8) return null;
  const date = new Date(Number(d.slice(0, 4)), Number(d.slice(4, 6)) - 1, Number(d.slice(6, 8)));
  const valid = date.getMonth() === Number(d.slice(4, 6)) - 1 && date < new Date() && date.getFullYear() > 1900;
  return valid ? date : null;
}

function ageOf(birth: Date) {
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now < new Date(now.getFullYear(), birth.getMonth(), birth.getDate())) age -= 1;
  return age;
}

/** 피그마: 닉네임·성별·생년월일 (348:14980 / 입력 348:15012 / 348:15065) */
export default function ProfileSetupScreen() {
  const { t } = useTranslation();
  const signUp = useSignUpStore();
  const [nickname, setNickname] = useState(signUp.nickname);
  const [checked, setChecked] = useState<'unchecked' | 'available' | 'taken'>('unchecked');
  const [gender, setGender] = useState<Gender | null>(signUp.gender);
  const [birth, setBirth] = useState(formatBirth(signUp.birthDate));

  const nicknameValid = NICKNAME_RULE.test(nickname);
  const birthDate = parseBirth(birth);
  const isSenior = birthDate ? ageOf(birthDate) >= SENIOR_AGE : false;
  const canNext = nicknameValid && checked === 'available' && gender && birthDate;

  const check = async () => {
    const { available } = await authApi.checkNickname(nickname);
    setChecked(available ? 'available' : 'taken');
  };

  const next = () => {
    if (!birthDate || !gender) return;
    const iso = `${birthDate.getFullYear()}-${String(birthDate.getMonth() + 1).padStart(2, '0')}-${String(birthDate.getDate()).padStart(2, '0')}`;
    signUp.set({ nickname, gender, birthDate: iso });
    router.push('/phone-verify');
  };

  return (
    <OnboardingLayout
      title={t('onboarding.welcomeTitle')}
      footer={<Button label={t('onboarding.next')} size="lg" shape="rounded" variant={canNext ? 'dark' : 'neutral'} disabled={!canNext} onPress={next} />}
    >
      <TextField
        label={t('onboarding.nickname')}
        placeholder={t('onboarding.nicknamePlaceholder')}
        value={nickname}
        onChangeText={(v) => {
          setNickname(v);
          setChecked('unchecked');
        }}
        maxLength={8}
        showCount
        helperText={checked === 'available' ? t('profileEdit.available') : t('onboarding.nicknameHelp')}
        errorText={nickname && !nicknameValid ? t('profileEdit.usernameInvalid') : checked === 'taken' ? t('profileEdit.taken') : undefined}
        right={
          <Button
            label={t('profileEdit.checkDuplicate')}
            variant="soft"
            size="xs"
            shape="square"
            disabled={!nicknameValid || checked !== 'unchecked'}
            onPress={check}
          />
        }
      />

      <View style={styles.field}>
        <AppText variant="label1">{t('onboarding.gender')}</AppText>
        <SegmentButtons
          value={gender}
          onChange={setGender}
          options={[
            { value: 'male', label: t('profileEdit.male') },
            { value: 'female', label: t('profileEdit.female') },
          ]}
        />
      </View>

      <TextField
        label={t('onboarding.birth')}
        placeholder={t('onboarding.birthPlaceholder')}
        value={birth}
        onChangeText={(v) => setBirth(formatBirth(v))}
        keyboardType="number-pad"
        maxLength={14}
        helperText={isSenior ? t('onboarding.seniorNotice', { age: SENIOR_AGE }) : t('onboarding.birthHelp')}
        errorText={birth.replace(/\D/g, '').length === 8 && !birthDate ? t('onboarding.birthInvalid') : undefined}
      />
      {/* WBS 4.1: 노인 무료 등급은 국내 본인 인증(카카오·네이버·PASS) 후 적용. 5단계에서 연결 */}
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8 },
});
