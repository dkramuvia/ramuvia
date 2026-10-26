import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { soloApi, type SoloAgency } from '@/api/endpoints/solo';
import { AppText, Button, ChipTabs, Screen, TextField } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { makeStyles, radius, useColors } from '@/theme';
import { showToast } from '@/utils/toast';

const MAX_AGENCIES = 3;
type Hours = '12' | '24' | '48';

/**
 * 1인 가구 안심 모드 (보완 화면 설계 4.2, 피그마 v2.4 1015:45778, 수정 반영본 C4).
 * 가입 26 "1인 가구 모드를 활성화 할게요" 직후 / 설정 › 안전 & SOS 에서 진입.
 *
 * - 기관 이름 + 휴대폰 번호를 직접 적습니다 (기관 목록에서 고르지 않음). 문자를 받을 수 있는 번호여야 합니다
 * - 이벤트 때만 라무핀 서버가 문자를 보냅니다: SOS = 정확한 위치 링크, 움직임 없음·배터리 10% 이하 = 알림만, 평소 위치 = 보내지 않음
 * - 친구를 추가해도 안심 모드는 유지됩니다. 해제는 이 화면(설정 › 안전 & SOS)에서
 */
export default function SoloModeScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const updateUser = useAuthStore((s) => s.updateUser);
  const { data: setting } = useQuery({ queryKey: ['solo'], queryFn: soloApi.get });

  const [agencies, setAgencies] = useState<SoloAgency[]>([{ name: '', phone: '' }]);
  const [hours, setHours] = useState<Hours>('24');
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);

  const loaded = !!setting;
  useEffect(() => {
    if (!setting) return;
    if (setting.agencies.length) setAgencies(setting.agencies);
    setHours(String(setting.inactivityHours) as Hours);
    setConsent(setting.consented);
    // 처음 받을 때 한 번만 채웁니다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const filled = agencies.filter((a) => a.name.trim() && a.phone.trim());
  const validPhone = (phone: string) => /^01[016789]\d{7,8}$/.test(phone.replace(/\D/g, ''));
  const canStart = filled.length > 0 && filled.every((a) => validPhone(a.phone)) && consent;

  const setAgency = (index: number, patch: Partial<SoloAgency>) => setAgencies(agencies.map((a, i) => (i === index ? { ...a, ...patch } : a)));

  const save = async (enabled: boolean) => {
    setSaving(true);
    try {
      const saved = await soloApi.save({
        enabled,
        inactivityHours: Number(hours) as 12 | 24 | 48,
        consent: enabled ? consent : setting?.consented ?? false,
        agencies: filled.map((a) => ({ name: a.name.trim(), phone: a.phone.replace(/\D/g, '') })),
      });
      queryClient.setQueryData(['solo'], saved);
      updateUser({ singleHouseholdMode: saved.enabled });
      showToast(t(enabled ? 'solo.started' : 'solo.stopped'));
      if (router.canGoBack()) router.back();
    } catch (error) {
      const message = (error as { response?: { data?: { message?: unknown } } }).response?.data?.message;
      showToast(typeof message === 'string' ? message : t('common.requestFailed'));
    } finally {
      setSaving(false);
    }
  };

  const rows: [string, string, boolean][] = [
    [t('solo.rowSos'), t('solo.rowSosValue'), true],
    [t('solo.rowInactive'), t('solo.alertOnly'), false],
    [t('solo.rowBattery'), t('solo.alertOnly'), false],
    [t('solo.rowLive'), t('solo.notSent'), false],
  ];

  return (
    <Screen
      title={t('screens.soloMode')}
      tab="map"
      contentStyle={styles.content}
      footer={
        <View style={styles.footer}>
          {setting?.enabled ? (
            <Button label={t('solo.stop')} variant="neutral" size="lg" style={styles.flex} disabled={saving} onPress={() => void save(false)} />
          ) : (
            <Button label={t('solo.later')} variant="neutral" size="lg" style={styles.flex} onPress={() => router.back()} />
          )}
          <Button label={t(setting?.enabled ? 'solo.save' : 'solo.start')} variant="brown" size="lg" style={styles.flex2} disabled={!canStart || saving} onPress={() => void save(true)} />
        </View>
      }
    >
      <AppText variant="body2" color={colors.textSecondary}>
        {t('solo.desc')}
      </AppText>

      <View style={styles.section}>
        <AppText variant="label1" color={colors.textLabel}>
          {t('solo.agencies')}
        </AppText>
        {agencies.map((a, index) => (
          <View key={index} style={styles.agencyRow}>
            <View style={styles.flex}>
              <TextField placeholder={t('solo.agencyName')} value={a.name} onChangeText={(name) => setAgency(index, { name })} maxLength={30} />
            </View>
            <View style={styles.flex}>
              <TextField placeholder="010-0000-0000" value={a.phone} onChangeText={(phone) => setAgency(index, { phone })} keyboardType="phone-pad" maxLength={13} />
            </View>
            {agencies.length > 1 ? (
              <Pressable accessibilityRole="button" accessibilityLabel={t('common.delete')} hitSlop={8} onPress={() => setAgencies(agencies.filter((_, i) => i !== index))}>
                <Ionicons name="close-circle-outline" size={22} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
        ))}
        {agencies.length < MAX_AGENCIES ? (
          <Pressable accessibilityRole="button" onPress={() => setAgencies([...agencies, { name: '', phone: '' }])}>
            <AppText variant="label2" color={colors.primary}>
              + {t('solo.addAgency')}
            </AppText>
          </Pressable>
        ) : null}
        <AppText variant="caption" color={colors.textTertiary}>
          {t('solo.agencyHint')}
        </AppText>
      </View>

      <View style={styles.table}>
        <AppText variant="label1Bold">{t('solo.sentTitle')}</AppText>
        {rows.map(([label, value, strong]) => (
          <View key={label} style={styles.tableRow}>
            <AppText variant="label2" style={styles.flex}>
              {label}
            </AppText>
            <AppText variant="label2" color={strong ? colors.online : colors.textTertiary}>
              {value}
            </AppText>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <AppText variant="label1" color={colors.textLabel}>
          {t('solo.inactiveTitle')}
        </AppText>
        <ChipTabs<Hours>
          tone="dark"
          value={hours}
          onChange={setHours}
          options={[
            { value: '12', label: t('solo.hours', { count: 12 }) },
            { value: '24', label: t('solo.hours', { count: 24 }) },
            { value: '48', label: t('solo.hours', { count: 48 }) },
          ]}
        />
      </View>

      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: consent }} onPress={() => setConsent(!consent)} style={styles.consent}>
        <Ionicons name={consent ? 'checkbox' : 'square-outline'} size={22} color={consent ? colors.brown : colors.textMuted} />
        <AppText variant="label2" style={styles.flex}>
          {t('solo.consent')}
        </AppText>
      </Pressable>

      <AppText variant="caption" color={colors.textTertiary}>
        {t('solo.keepNote')}
      </AppText>
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  content: { gap: 18, paddingTop: 12 },
  flex: { flex: 1 },
  flex2: { flex: 2 },
  footer: { flexDirection: 'row', gap: 8 },
  section: { gap: 8 },
  agencyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  table: { gap: 8, padding: 14, borderRadius: radius.md, backgroundColor: colors.surface },
  tableRow: { flexDirection: 'row', alignItems: 'center' },
  consent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
}));
