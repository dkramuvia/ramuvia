import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { profileApi } from '@/api/endpoints/settings';
import { AppText, Button, Popup, Screen } from '@/components/ui';
import { endSession } from '@/features/auth/session';
import { useAuthStore } from '@/stores/authStore';
import { colors, radius, typography } from '@/theme';

/** 피그마: 회원 탈퇴 (283:27331 / 동의 체크 283:27419). WBS 11.2: 유료 사용자는 혜택 포기 확인 후 삭제 */
export default function WithdrawScreen() {
  const { t } = useTranslation();
  const me = useAuthStore((s) => s.user);
  const [agreed, setAgreed] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmPaid, setConfirmPaid] = useState(false);
  const [pending, setPending] = useState(false);

  const isPaid = me ? !['basic', 'care'].includes(me.plan) : false;

  const withdraw = async () => {
    setConfirmPaid(false);
    setPending(true);
    try {
      await profileApi.withdraw(reason.trim());
      await endSession('logout');
    } finally {
      setPending(false);
    }
  };

  return (
    <Screen
      title={t('screens.withdraw')}
      contentStyle={styles.content}
      footer={
        <Button
          label={t('account.withdraw')}
          size="lg"
          shape="rounded"
          variant="dark"
          disabled={!agreed || pending}
          onPress={() => (isPaid ? setConfirmPaid(true) : withdraw())}
          style={agreed ? styles.withdrawButton : undefined}
        />
      }
    >
      <AppText variant="title4">{t('account.withdrawHeadline')}</AppText>

      <View style={styles.notices}>
        {[t('account.notice1'), t('account.notice2')].map((notice) => (
          <View key={notice} style={styles.notice}>
            <Ionicons name="information-circle-outline" size={20} color={colors.textTertiary} />
            <AppText variant="label1" color={colors.textSecondary} style={styles.flex}>
              {notice}
            </AppText>
          </View>
        ))}
      </View>

      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: agreed }} onPress={() => setAgreed((v) => !v)} style={styles.agree}>
        <Ionicons name={agreed ? 'checkbox' : 'square-outline'} size={22} color={colors.textStrong} />
        <AppText variant="label1" style={styles.flex}>
          {t('account.agree')}
        </AppText>
      </Pressable>

      <View style={styles.reason}>
        <AppText variant="title4">{t('account.reasonTitle')}</AppText>
        <TextInput
          value={reason}
          onChangeText={setReason}
          placeholder={t('account.reasonPlaceholder')}
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={500}
          textAlignVertical="top"
          style={styles.reasonInput}
        />
      </View>

      <Popup
        visible={confirmPaid}
        title={t('account.paidConfirmTitle')}
        message={t('account.paidConfirmMessage')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setConfirmPaid(false)}
        confirmLabel={t('account.withdraw')}
        onConfirm={withdraw}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 28, paddingTop: 24 },
  flex: { flex: 1 },
  notices: { gap: 16 },
  notice: { flexDirection: 'row', gap: 8 },
  agree: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reason: { gap: 16 },
  reasonInput: {
    height: 250,
    padding: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceStrong,
    ...typography.label1,
    color: colors.text,
  },
  withdrawButton: { backgroundColor: '#0A0A0A' },
});
