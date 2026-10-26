import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { AppText, Button, ChipTabs, TextField } from '@/components/ui';
import { OnboardingLayout } from '@/features/onboarding/OnboardingLayout';
import { useSignUpStore } from '@/stores/signUpStore';
import { makeStyles, radius, useColors } from '@/theme';
import { showToast } from '@/utils/toast';

type Method = 'phone' | 'email';

function ageOf(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age -= 1;
  return age;
}

/**
 * 보호자 동의 (만 14세 미만, 보완 화면 설계 4.1, 피그마 v2.4 1015:45694, 수정 반영본 C3).
 * 가입 12(닉네임·생년월일) 다음, 만 14세 미만일 때만.
 *
 * - 보호자 휴대폰(문자)이 기본. 가입을 마치면 라무핀 서버가 동의 링크를 문자(알리고)로 보내고, 보호자가 웹페이지에서 동의합니다
 * - 이메일은 해외 번호용 보조인데, 메일 발송 수단이 아직 없어 "준비 중" 으로 둡니다
 * - 24시간 안에 동의가 없으면 입력한 정보는 자동으로 지워집니다. 동의 전까지 위치를 모으지 않습니다
 */
export default function GuardianConsentScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const signUp = useSignUpStore();
  const [name, setName] = useState(signUp.guardian?.name ?? '');
  const [method, setMethod] = useState<Method>('phone');
  const [phone, setPhone] = useState(signUp.guardian?.phone ?? '');
  const [agreeLocation, setAgreeLocation] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [sosLink, setSosLink] = useState(signUp.guardian?.sosLink ?? false);

  const validPhone = /^01[016789]\d{7,8}$/.test(phone.replace(/\D/g, ''));
  const canNext = !!name.trim() && method === 'phone' && validPhone && agreeLocation && agreePrivacy;
  const birth = signUp.birthDate.replace(/-/g, '.');

  const next = () => {
    signUp.set({ guardian: { name: name.trim(), phone: phone.replace(/\D/g, ''), sosLink } });
    router.push('/phone-verify');
  };

  return (
    <OnboardingLayout title={t('guardian.screenTitle')}>
      <View style={styles.body}>
        <AppText variant="title2">{t('guardian.title')}</AppText>
        <AppText variant="label2" color={colors.textSecondary}>
          {t('guardian.lead', { birth, age: signUp.birthDate ? ageOf(signUp.birthDate) : '' })}
        </AppText>

        <TextField label={t('guardian.name')} value={name} onChangeText={setName} maxLength={20} />

        <View style={styles.gap}>
          <AppText variant="label1" color={colors.textSecondary}>
            {t('guardian.method')}
          </AppText>
          <ChipTabs<Method>
            tone="dark"
            value={method}
            onChange={(m) => (m === 'email' ? showToast(t('guardian.emailPreparing')) : setMethod(m))}
            options={[
              { value: 'phone', label: t('guardian.methodPhone') },
              { value: 'email', label: t('guardian.methodEmail') },
            ]}
          />
          <TextField placeholder="010-0000-0000" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={13} />
        </View>

        <View style={styles.box}>
          <Check checked={agreeLocation} onPress={() => setAgreeLocation(!agreeLocation)} label={t('guardian.agreeLocation')} />
          <Check checked={agreePrivacy} onPress={() => setAgreePrivacy(!agreePrivacy)} label={t('guardian.agreePrivacy')} />
          <Check checked={sosLink} onPress={() => setSosLink(!sosLink)} label={t('guardian.agreeSos')} />
        </View>

        <AppText variant="caption" color={colors.textTertiary}>
          {t('guardian.note')}
        </AppText>
      </View>

      <Button label={t('guardian.next')} variant="brown" size="lg" disabled={!canNext} onPress={next} />
    </OnboardingLayout>
  );
}

function Check({ checked, onPress, label }: { checked: boolean; onPress: () => void; label: string }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onPress} style={styles.check}>
      <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={22} color={checked ? colors.brown : colors.textMuted} />
      <AppText variant="label2" style={styles.flex}>
        {label}
      </AppText>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  body: { flex: 1, gap: 16 },
  flex: { flex: 1 },
  gap: { gap: 8 },
  box: { gap: 4, padding: 12, borderRadius: radius.md, backgroundColor: colors.surface },
  check: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
}));
