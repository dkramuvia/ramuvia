import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { authApi } from '@/api/endpoints/auth';
import { AppText, Button, SegmentButtons, TextField } from '@/components/ui';
import { CharacterPicker } from '@/features/settings/CharacterPicker';
import { OnboardingLayout } from '@/features/onboarding/OnboardingLayout';
import { useSignUpStore } from '@/stores/signUpStore';
import { useColors } from '@/theme';
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

/** 안내 문구에 쓸 이름 ('naver' → '네이버') */
function providerLabel(provider: string): string {
  return { kakao: '카카오', naver: '네이버', google: '구글', x: 'X' }[provider] ?? provider;
}

function ageOf(birth: Date) {
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now < new Date(now.getFullYear(), birth.getMonth(), birth.getDate())) age -= 1;
  return age;
}

/** 피그마: 닉네임·성별·생년월일 (348:14980 / 입력 348:15012 / 348:15065) */
export default function ProfileSetupScreen() {
  const colors = useColors();
  const { t } = useTranslation();
  const signUp = useSignUpStore();
  const [nickname, setNickname] = useState(signUp.nickname);
  const [checked, setChecked] = useState<'unchecked' | 'available' | 'taken'>('unchecked');
  const [gender, setGender] = useState<Gender | null>(signUp.gender);
  // 소셜에서 받은 프로필 사진이 있으면 그대로 두고, 캐릭터를 고르면 그것으로 바꿉니다
  const [avatarKey, setAvatarKey] = useState<string | undefined>(signUp.avatarUrl || undefined);
  // 카카오·네이버가 출생연도를 확인해 줬으면 그 해로 시작합니다 (WBS 3.6)
  const [birth, setBirth] = useState(formatBirth(signUp.birthDate) || (signUp.verifiedBirthYear ? String(signUp.verifiedBirthYear) : ''));

  const nicknameValid = NICKNAME_RULE.test(nickname);
  const birthDate = parseBirth(birth);
  /**
   * 적은 연도가 소셜이 확인해 준 연도와 다른 경우.
   *
   * 막아야 합니다. 서버는 무료 등급을 **확인된 연도**로 정하므로, 그냥 두면
   * 화면에는 "노인 무료 안내"가 뜨는데 실제로는 유료로 가입되는 일이 생깁니다.
   */
  const yearMismatch = !!signUp.verifiedBirthYear && !!birthDate && birthDate.getFullYear() !== signUp.verifiedBirthYear;
  const seniorAge = signUp.verifiedBirthYear ? new Date().getFullYear() - signUp.verifiedBirthYear : birthDate ? ageOf(birthDate) : null;
  const isSenior = seniorAge !== null && seniorAge >= SENIOR_AGE;
  const canNext = nicknameValid && checked === 'available' && gender && birthDate && !yearMismatch;

  const check = async () => {
    const { available } = await authApi.checkNickname(nickname);
    setChecked(available ? 'available' : 'taken');
  };

  const next = () => {
    if (!birthDate || !gender) return;
    const iso = `${birthDate.getFullYear()}-${String(birthDate.getMonth() + 1).padStart(2, '0')}-${String(birthDate.getDate()).padStart(2, '0')}`;
    signUp.set({ nickname, gender, birthDate: iso, avatarUrl: avatarKey ?? '' });
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

      <TextField
        label={t('onboarding.birth')}
        placeholder={t('onboarding.birthPlaceholder')}
        value={birth}
        onChangeText={(v) => setBirth(formatBirth(v))}
        keyboardType="number-pad"
        maxLength={14}
        helperText={
          signUp.verifiedBirthYear
            ? t('onboarding.birthVerified', { provider: providerLabel(signUp.provider), year: signUp.verifiedBirthYear })
            : isSenior
              ? t('onboarding.seniorNotice', { age: SENIOR_AGE })
              : t('onboarding.birthHelp')
        }
        errorText={
          yearMismatch
            ? t('onboarding.birthYearMismatch', { year: signUp.verifiedBirthYear })
            : birth.replace(/\D/g, '').length === 8 && !birthDate
              ? t('onboarding.birthInvalid')
              : undefined
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

      {/* 성별에 따른 캐릭터를 좌우로 넘겨 고릅니다 (피그마 839:41835).
          프로필 편집과 같은 컴포넌트입니다 */}
      {gender ? <CharacterPicker gender={gender} value={avatarKey} onChange={setAvatarKey} /> : null}

      {/* 노인 무료 등급(WBS 4.1)은 카카오·네이버가 확인해 준 출생연도로 정합니다.
          확인 항목이 없는 소셜(구글·X)로 들어오면 본인이 적은 값을 씁니다 */}
      {signUp.verifiedBirthYear && isSenior ? (
        <AppText variant="label2" color={colors.brown}>
          {t('onboarding.seniorNotice', { age: SENIOR_AGE })}
        </AppText>
      ) : null}
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8 },
});
