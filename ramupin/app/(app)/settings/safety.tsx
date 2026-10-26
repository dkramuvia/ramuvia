import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, View } from 'react-native';

import { AppText, Avatar, Button, MenuItem, Screen, TextField, ToggleRow } from '@/components/ui';
import { useFriends } from '@/features/friends/queries';
import { useMyGroups } from '@/features/groups/queries';
import { MOCK_POLICIES, PLAN_NAMES } from '@/features/policy/policies';
import { usePlan } from '@/features/policy/usePlan';
import { useSafetySetting, useSaveSafetySetting } from '@/features/settings/queries';
import { countSosRecipients } from '@/features/sos/recipientCount';
import { useAuthStore } from '@/stores/authStore';
import { makeStyles, radius, useColors, withAlpha } from '@/theme';
import type { SafetySetting } from '@/types/models';
import { showToast } from '@/utils/toast';

/**
 * 안전 & SOS — SOS 수신자 설정 (보완 화면 설계 4.4, 피그마 v2.4 1015:54615).
 * 예전 설정 2-04(안전 & SOS)·2-05(친구 지정)·2-06(그룹 지정)을 한 화면으로 모읍니다.
 *
 * - 맨 위에 쓰는 인원 / 등급 한도. 그룹은 멤버 수만큼 인원에 들어갑니다 (중복은 1명)
 * - 비회원 연락처에는 라무핀 서버가 문자로 자동 발송합니다. 플래티넘부터 · 국내 휴대폰 번호만 (C1·C6)
 * - 관공서 연계는 실제로 연결된 기관이 없어 "준비 중" 으로만 둡니다 (C7, 대표님 확인 대기)
 * - SOS 우선 규칙: 숨기기·비공개와 관계없이 정확한 위치를 보냅니다 (끌 수 없음)
 */
export default function SafetyScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const myId = useAuthStore((s) => s.user?.id);
  const { data: setting } = useSafetySetting();
  const save = useSaveSafetySetting();
  const { data: friends = [] } = useFriends();
  const { data: groups = [] } = useMyGroups();
  const { planId, limit, can } = usePlan();
  const [contactModal, setContactModal] = useState(false);

  if (!setting) return <Screen title={t('screens.safety')} tab="map" />;

  const update = (patch: Partial<SafetySetting>) => save.mutate({ ...setting, ...patch });
  const recipientFriends = friends.filter((f) => setting.recipientFriendIds.includes(f.id));
  const recipientGroups = groups.filter((g) => setting.recipientGroupIds.includes(g.id));
  const recipientLimit = limit('sosRecipientLimit');
  const used = countSosRecipients(setting, groups, myId);
  const full = recipientLimit > 0 && used >= recipientLimit;
  const smsAllowed = can('sosSms');

  const addContact = (name: string, phone: string) => {
    if (used >= recipientLimit) {
      showToast(t('safety.limit', { limit: recipientLimit }));
      return;
    }
    update({ contacts: [...setting.contacts, { name, phone }] });
    setContactModal(false);
  };

  return (
    <Screen title={t('screens.safety')} tab="map" contentStyle={styles.content}>
      <ToggleRow
        title={t('safety.sosEnabled')}
        description={t('safety.sosEnabledDesc')}
        value={setting.sosEnabled}
        onValueChange={(sosEnabled) => update({ sosEnabled })}
      />

      <View style={[styles.gap, !setting.sosEnabled && styles.dimmed]}>
        {/* 쓰는 인원 / 한도 (NEW) */}
        <View style={styles.usageCard}>
          <View style={styles.row}>
            <AppText variant="body2Bold" style={styles.flex}>
              {t('safety.usageTitle')}
            </AppText>
            <AppText variant="label1Bold" color={full ? colors.danger : colors.text}>
              {t('safety.usage', { used, limit: recipientLimit, plan: PLAN_NAMES[planId] })}
            </AppText>
          </View>
          <View style={styles.track}>
            <View style={[styles.bar, { width: `${recipientLimit ? Math.min(1, used / recipientLimit) * 100 : 0}%` }, full && styles.barFull]} />
          </View>
          {full ? (
            <AppText variant="caption" color={colors.textTertiary}>
              {t('safety.usageFull', { platinum: MOCK_POLICIES.platinum.sosRecipientLimit, trinity: MOCK_POLICIES.trinity.sosRecipientLimit })}
            </AppText>
          ) : null}
        </View>

        <AppText variant="label1" color={colors.textSecondary}>
          {t('safety.recipientList')}
        </AppText>
        {recipientFriends.length + recipientGroups.length + setting.contacts.length === 0 ? (
          <AppText variant="label2" color={colors.textMuted}>
            {t('safety.noRecipients')}
          </AppText>
        ) : null}
        {recipientFriends.map((f) => (
          <RecipientCard
            key={f.id}
            title={f.nickname}
            subtitle={t('safety.kindFriend')}
            avatar={<Avatar name={f.nickname} imageUrl={f.avatarUrl} />}
            onRemove={() => update({ recipientFriendIds: setting.recipientFriendIds.filter((id) => id !== f.id) })}
          />
        ))}
        {recipientGroups.map((g) => (
          <RecipientCard
            key={g.id}
            title={g.name}
            subtitle={t('safety.kindGroup', { count: g.memberCount })}
            avatar={<Avatar name={g.name} />}
            onRemove={() => update({ recipientGroupIds: setting.recipientGroupIds.filter((id) => id !== g.id) })}
          />
        ))}
        {setting.contacts.map((c, index) => (
          <RecipientCard
            key={c.id ?? `${c.phone}-${index}`}
            title={`${c.name} (${c.maskedPhone ?? c.phone})`}
            subtitle={t('safety.kindSms')}
            locked={!smsAllowed || !setting.smsEnabled}
            avatar={
              <View style={styles.smsIcon}>
                <Ionicons name={smsAllowed ? 'chatbubble-ellipses-outline' : 'lock-closed'} size={18} color={colors.textTertiary} />
              </View>
            }
            onRemove={() => update({ contacts: setting.contacts.filter((_, i) => i !== index) })}
          />
        ))}

        <View style={styles.buttons}>
          <Button label={t('safety.recipients')} variant="danger" style={styles.flex} onPress={() => router.push('/settings/safety-recipients')} />
          <Button
            label={t('safety.addContact')}
            variant="soft"
            style={styles.flex}
            onPress={() => (smsAllowed ? setContactModal(true) : showToast(t('safety.smsLocked')))}
          />
        </View>
        <View style={styles.ruleBox}>
          <AppText variant="caption" color={colors.textTertiary}>
            {t('safety.groupRule')}
          </AppText>
        </View>
      </View>

      {/* 관공서 (인원과 별도) — 연계 기관이 정해지기 전이라 준비 중 (C7) */}
      <View style={styles.gap}>
        <AppText variant="label1" color={colors.textSecondary}>
          {t('safety.agencies')}
        </AppText>
        <View style={styles.agencyCard}>
          <AppText variant="body2" color={colors.textMuted} style={styles.flex}>
            {t('safety.agencyPreparing')}
          </AppText>
        </View>
      </View>

      {/* SOS 우선 규칙 (NEW) — 끌 수 없음 */}
      <View style={styles.priorityCard}>
        <Ionicons name="shield-checkmark-outline" size={22} color={colors.sos} />
        <View style={styles.flex}>
          <AppText variant="body2Bold">{t('safety.priorityTitle')}</AppText>
          <AppText variant="caption" color={colors.textSecondary}>
            {t('safety.priorityDesc')}
          </AppText>
        </View>
      </View>

      <ToggleRow
        title={t('safety.longPressTitle')}
        description={t('safety.longPressDesc')}
        value={setting.longPressStart}
        onValueChange={(longPressStart) => update({ longPressStart })}
      />

      <MenuItem label={t('safety.emergencyMenu')} onPress={() => router.push('/settings/emergency')} />
      {/* 보완 4.2: 안전 & SOS 에서도 1인 가구 안심 모드 설정·해제 */}
      <MenuItem label={t('screens.soloMode')} onPress={() => router.push('/settings/solo-mode')} />

      <AppText variant="caption" color={colors.textTertiary}>
        {t('safety.sentContent')}
      </AppText>

      <ContactModal visible={contactModal} onClose={() => setContactModal(false)} onAdd={addContact} />
    </Screen>
  );
}

function RecipientCard({
  title,
  subtitle,
  avatar,
  locked,
  onRemove,
}: {
  title: string;
  subtitle: string;
  avatar: ReactNode;
  locked?: boolean;
  onRemove: () => void;
}) {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  return (
    <View style={[styles.recipient, locked && styles.dimmed]}>
      {avatar}
      <View style={styles.flex}>
        <AppText variant="listTitle" numberOfLines={1}>
          {title}
        </AppText>
        <AppText variant="caption" color={colors.textTertiary} numberOfLines={1}>
          {subtitle}
        </AppText>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={t('common.delete')} hitSlop={8} onPress={onRemove}>
        <Ionicons name="close-circle-outline" size={22} color={colors.primarySoft} />
      </Pressable>
    </View>
  );
}

function ContactModal({ visible, onClose, onAdd }: { visible: boolean; onClose: () => void; onAdd: (name: string, phone: string) => void }) {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  // 국내 휴대폰 번호만 (알리고는 국내 전용). 서버도 같은 기준으로 막습니다
  const valid = /^01[016789]\d{7,8}$/.test(phone.replace(/\D/g, ''));
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.modal} onPress={() => undefined}>
          <AppText variant="title4">{t('safety.addContact')}</AppText>
          <TextField label={t('safety.contactName')} value={name} onChangeText={setName} maxLength={20} />
          <TextField label={t('safety.contactPhone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={13} />
          <AppText variant="caption" color={colors.textTertiary}>
            {t('safety.contactNote')}
          </AppText>
          <View style={styles.modalButtons}>
            <Button label={t('common.cancel')} variant="neutral" onPress={onClose} style={styles.flex} />
            <Button
              label={t('common.save')}
              variant="danger"
              disabled={!name.trim() || !valid}
              onPress={() => {
                onAdd(name.trim(), phone.replace(/\D/g, ''));
                setName('');
                setPhone('');
              }}
              style={styles.flex}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  content: { gap: 24 },
  flex: { flex: 1 },
  gap: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center' },
  dimmed: { opacity: 0.4 },
  usageCard: { gap: 8, padding: 16, borderRadius: radius.md, backgroundColor: colors.card },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.surfaceStrong, overflow: 'hidden' },
  bar: { height: 4, borderRadius: 2, backgroundColor: colors.brownLight },
  barFull: { backgroundColor: colors.danger },
  recipient: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, backgroundColor: colors.surface },
  smsIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  buttons: { flexDirection: 'row', gap: 8 },
  ruleBox: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, padding: 12 },
  agencyCard: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, backgroundColor: colors.surface, padding: 16 },
  priorityCard: { flexDirection: 'row', gap: 12, padding: 16, borderRadius: radius.md, backgroundColor: withAlpha(colors.sos, 0.1) },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', paddingHorizontal: 20 },
  modal: { borderRadius: 10, backgroundColor: colors.popup, padding: 24, gap: 16 },
  modalButtons: { flexDirection: 'row', gap: 8 },
}));
