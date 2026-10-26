import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { AppText, Button, Screen, TextField, ToggleRow } from '@/components/ui';
import { PLAN_NAMES } from '@/features/policy/policies';
import { usePlan } from '@/features/policy/usePlan';
import { useSafetySetting, useSaveSafetySetting } from '@/features/settings/queries';
import { makeStyles, radius, useColors } from '@/theme';
import { showToast } from '@/utils/toast';

/** 여행 중 나라가 바뀔 때 빠르게 바꾸는 번호 (보완 4.6) */
const QUICK_NUMBERS = ['911', '112', '119', '999', '000'];

/**
 * 긴급전화 직접 등록 · SOS 문자 (보완 화면 설계 4.6, 피그마 v2.4 1015:54675, 수정 반영본 C9).
 * 나의 프로필 › 안전 & SOS › [긴급전화 · SOS 문자], SOS 결과 화면의 [긴급전화 등록하기].
 *
 * - 긴급전화 번호는 나라별 자동이 아니라 사용자가 직접 등록합니다 (대표 확정 방침)
 * - SOS 문자는 라무핀 서버가 비회원 연락처에 자동으로 보냅니다. 폰 인터넷이 끊겼을 때만 문자 창이 열립니다 (C1·C9)
 * - 음성 녹음은 지역별 녹음 동의 법규 때문에 끌 수 있습니다
 */
export default function EmergencySetupScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const { data: setting } = useSafetySetting();
  const save = useSaveSafetySetting();
  const { can, minPlanFor } = usePlan();

  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [smsEnabled, setSmsEnabled] = useState(true);
  const [recordEnabled, setRecordEnabled] = useState(true);

  const loaded = setting !== undefined;
  useEffect(() => {
    if (!setting) return;
    setName(setting.emergencyName ?? '');
    setNumber(setting.emergencyNumber ?? '');
    setSmsEnabled(setting.smsEnabled);
    setRecordEnabled(setting.recordEnabled);
    // 처음 받을 때 한 번만 채웁니다. 저장 뒤 다시 받아도 입력 중인 값을 덮지 않게
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const onSave = () => {
    if (!setting) return;
    save.mutate(
      {
        ...setting,
        emergencyName: number.trim() ? name.trim() || t('emergency.defaultName') : null,
        emergencyNumber: number.trim() || null,
        smsEnabled,
        recordEnabled,
      },
      {
        onSuccess: () => {
          showToast(t('emergency.saved'));
          router.back();
        },
      },
    );
  };

  const smsAllowed = can('sosSms');

  return (
    <Screen
      title={t('screens.emergency')}
      tab="map"
      contentStyle={styles.content}
      footer={<Button label={t('common.save')} variant="danger" size="lg" shape="rounded" disabled={!setting || save.isPending} onPress={onSave} />}
    >
      <AppText variant="label2" color={colors.textSecondary}>
        {t('emergency.desc')}
      </AppText>

      <View style={styles.row}>
        <View style={styles.name}>
          <TextField label={t('emergency.name')} placeholder="Emergency" value={name} onChangeText={setName} maxLength={20} />
        </View>
        <View style={styles.flex}>
          <TextField label={t('emergency.number')} placeholder="911" value={number} onChangeText={setNumber} keyboardType="phone-pad" maxLength={20} />
        </View>
      </View>

      <View style={styles.quickRow}>
        <AppText variant="label2" color={colors.textTertiary}>
          {t('emergency.quick')}
        </AppText>
        {QUICK_NUMBERS.map((n) => (
          <Pressable key={n} accessibilityRole="button" onPress={() => setNumber(n)} style={[styles.chip, number === n && styles.chipOn]}>
            <AppText variant="label2" color={number === n ? colors.white : colors.text}>
              {n}
            </AppText>
          </Pressable>
        ))}
      </View>

      <View style={styles.section}>
        <AppText variant="label1" color={colors.textSecondary}>
          {t('emergency.smsSection')}
        </AppText>
        <ToggleRow
          title={t('emergency.smsTitle')}
          description={smsAllowed ? t('emergency.smsDesc') : t('emergency.smsLocked', { plan: PLAN_NAMES[minPlanFor('sosSms')] })}
          value={smsAllowed && smsEnabled}
          onValueChange={(on) => (smsAllowed ? setSmsEnabled(on) : showToast(t('safety.smsLocked')))}
        />
        {/* C9: iPhone 안내 박스 대신 회색 한 줄 — 인터넷이 끊겼을 때만 문자 창이 열립니다 */}
        <AppText variant="caption" color={colors.textTertiary}>
          {t('emergency.smsOffline')}
        </AppText>
      </View>

      <View style={styles.section}>
        <AppText variant="label1" color={colors.textSecondary}>
          {t('emergency.recordSection')}
        </AppText>
        <ToggleRow title={t('emergency.recordTitle')} description={t('emergency.recordDesc')} value={recordEnabled} onValueChange={setRecordEnabled} />
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  content: { gap: 20 },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: 8 },
  name: { flex: 1.2 },
  quickRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.brown, borderColor: colors.brown },
  section: { gap: 8 },
}));
