import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { AppText, Avatar, Button, Screen, TextField, ToggleRow } from '@/components/ui';
import { useFriends } from '@/features/friends/queries';
import { useMyGroups } from '@/features/groups/queries';
import { useSafetySetting, useSaveSafetySetting } from '@/features/settings/queries';
import { colors, radius } from '@/theme';
import type { SafetySetting } from '@/types/models';

/**
 * 피그마: 안전 & SOS (283:32611)
 * 기획: SOS 사용 설정 on/off, X 로 수신인(친구·그룹) 삭제, 추가 수신인 지정은 지정 화면으로
 * WBS 8.3·8.4·10.8: 관공서 연락처는 비워 두고 준비만, 발송은 서버에서
 */
export default function SafetyScreen() {
  const { t } = useTranslation();
  const { data: setting } = useSafetySetting();
  const save = useSaveSafetySetting();
  const { data: friends = [] } = useFriends();
  const { data: groups = [] } = useMyGroups();
  const [agencyModal, setAgencyModal] = useState(false);

  if (!setting) return <Screen title={t('screens.safety')} tab="map" />;

  const update = (patch: Partial<SafetySetting>) => save.mutate({ ...setting, ...patch });
  const recipientFriends = friends.filter((f) => setting.recipientFriendIds.includes(f.id));
  const recipientGroups = groups.filter((g) => setting.recipientGroupIds.includes(g.id));

  return (
    <Screen title={t('screens.safety')} tab="map" contentStyle={styles.content}>
      <ToggleRow
        title={t('safety.sosEnabled')}
        description={t('safety.sosEnabledDesc')}
        value={setting.sosEnabled}
        onValueChange={(sosEnabled) => update({ sosEnabled })}
      />

      <View style={[styles.gap, !setting.sosEnabled && styles.dimmed]}>
        <Button label={t('safety.recipients')} variant="danger" onPress={() => router.push('/settings/safety-recipients')} />
        <AppText variant="body2" style={styles.indent}>
          {t('safety.recipientsDesc')}
        </AppText>
      </View>

      <View style={[styles.gap, !setting.sosEnabled && styles.dimmed]}>
        <AppText variant="label1" color={colors.textSecondary}>
          {t('safety.recipientList')}
        </AppText>
        {recipientFriends.length + recipientGroups.length === 0 ? (
          <AppText variant="label2" color={colors.textMuted}>
            {t('safety.noRecipients')}
          </AppText>
        ) : null}
        {recipientFriends.map((f) => (
          <RecipientCard
            key={f.id}
            title={f.nickname}
            avatar={<Avatar name={f.nickname} imageUrl={f.avatarUrl} />}
            onRemove={() => update({ recipientFriendIds: setting.recipientFriendIds.filter((id) => id !== f.id) })}
          />
        ))}
        {recipientGroups.map((g) => (
          <RecipientCard
            key={g.id}
            title={g.name}
            avatar={
              <View style={styles.stack}>
                {g.members.slice(0, 2).map((m, i) => (
                  <View key={m.id} style={[styles.stackItem, { marginLeft: i ? -10 : 0 }]}>
                    <Avatar name={m.nickname} imageUrl={m.avatarUrl} size={36} />
                  </View>
                ))}
                {g.memberCount > 2 ? (
                  <View style={styles.more}>
                    <AppText variant="micro" color={colors.textTertiary}>
                      +{g.memberCount - 2}
                    </AppText>
                  </View>
                ) : null}
              </View>
            }
            onRemove={() => update({ recipientGroupIds: setting.recipientGroupIds.filter((id) => id !== g.id) })}
          />
        ))}
        <AppText variant="caption" color={colors.textTertiary}>
          {t('safety.sentContent')}
        </AppText>
      </View>

      <View style={styles.gap}>
        <AppText variant="label1" color={colors.textSecondary}>
          {t('safety.agencies')}
        </AppText>
        <View style={styles.agencyCard}>
          {setting.agencies.map((a) => (
            <View key={a.id} style={styles.agencyRow}>
              <AppText variant="body2Bold" style={styles.flex}>
                {a.name}
              </AppText>
              <AppText variant="body2" color={a.phone ? colors.text : colors.textMuted}>
                {a.phone || t('safety.agencyEmpty')}
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common.delete')}
                hitSlop={8}
                onPress={() => update({ agencies: setting.agencies.filter((x) => x.id !== a.id) })}
              >
                <Ionicons name="close-circle-outline" size={22} color={colors.primarySoft} />
              </Pressable>
            </View>
          ))}
        </View>
        <Button label={t('safety.addAgency')} variant="danger" onPress={() => setAgencyModal(true)} />
      </View>

      <AgencyModal
        visible={agencyModal}
        onClose={() => setAgencyModal(false)}
        onAdd={(name, phone) => {
          update({ agencies: [...setting.agencies, { id: `a${Date.now()}`, name, phone }] });
          setAgencyModal(false);
        }}
      />
    </Screen>
  );
}

function RecipientCard({ title, avatar, onRemove }: { title: string; avatar: ReactNode; onRemove: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.recipient}>
      {avatar}
      <AppText variant="listTitle" style={styles.flex} numberOfLines={1}>
        {title}
      </AppText>
      <Pressable accessibilityRole="button" accessibilityLabel={t('common.delete')} hitSlop={8} onPress={onRemove}>
        <Ionicons name="close-circle-outline" size={22} color={colors.primarySoft} />
      </Pressable>
    </View>
  );
}

function AgencyModal({ visible, onClose, onAdd }: { visible: boolean; onClose: () => void; onAdd: (name: string, phone: string) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.modal} onPress={() => undefined}>
          <AppText variant="title4">{t('safety.addAgency')}</AppText>
          <TextField label={t('safety.agencyName')} value={name} onChangeText={setName} maxLength={20} />
          <TextField label={t('safety.agencyPhone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={20} />
          <View style={styles.modalButtons}>
            <Button label={t('common.cancel')} variant="neutral" onPress={onClose} style={styles.flex} />
            <Button
              label={t('common.save')}
              variant="danger"
              disabled={!name.trim()}
              onPress={() => {
                onAdd(name.trim(), phone.trim());
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

const styles = StyleSheet.create({
  content: { gap: 24 },
  flex: { flex: 1 },
  gap: { gap: 12 },
  dimmed: { opacity: 0.4 },
  indent: { paddingHorizontal: 4 },
  recipient: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, backgroundColor: colors.surface },
  stack: { flexDirection: 'row', alignItems: 'center' },
  stackItem: { borderRadius: 20, borderWidth: 2, borderColor: colors.surface },
  more: {
    width: 40,
    height: 40,
    marginLeft: -10,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.surface,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agencyCard: { borderRadius: radius.md, backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 4 },
  agencyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', paddingHorizontal: 20 },
  modal: { borderRadius: 10, backgroundColor: colors.popup, padding: 24, gap: 16 },
  modalButtons: { flexDirection: 'row', gap: 8 },
});
