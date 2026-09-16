import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, Share, StyleSheet, View } from 'react-native';

import { friendsApi } from '@/api';
import { AppText, Button, Screen, TextField } from '@/components/ui';
import { RequestSentPopup } from '@/features/friends/RequestSentPopup';
import { buildFriendQr } from '@/features/friends/qr';
import { useSendFriendRequest } from '@/features/friends/queries';
import { blockedRequestReason } from '@/features/friends/relation';
import { useAuthStore } from '@/stores/authStore';
import { colors, radius } from '@/theme';
import { showToast } from '@/utils/toast';

const MENU: { key: string; icon: ComponentProps<typeof Ionicons>['name']; href: Href }[] = [
  { key: 'myQr', icon: 'qr-code-outline', href: '/friends/my-qr' },
  { key: 'byContacts', icon: 'person-circle-outline', href: '/friends/contacts' },
  { key: 'nearby', icon: 'location', href: '/friends/nearby' },
  { key: 'byQrScan', icon: 'scan-outline', href: '/friends/qr-scan' },
];

/** 피그마: 친구 추가 (283:23130) */
export default function FriendAddScreen() {
  const { t } = useTranslation();
  const me = useAuthStore((s) => s.user);
  const [idModal, setIdModal] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const shareInvite = () => {
    if (!me) return;
    Share.share({ message: t('friendAdd.inviteMessage', { id: me.publicId, link: buildFriendQr(me.publicId) }) });
  };

  return (
    <Screen tab="people" contentStyle={styles.content}>
      <AppText variant="title2">{t('friendAdd.title')}</AppText>

      <Pressable accessibilityRole="button" onPress={() => setIdModal(true)} style={styles.outlineButton}>
        <AppText variant="body2Bold" color={colors.textSecondary}>
          {t('friendAdd.byUserId')}
        </AppText>
      </Pressable>

      <View style={styles.menu}>
        {MENU.map((item) => (
          <Pressable key={item.key} accessibilityRole="button" onPress={() => router.push(item.href)} style={styles.menuItem}>
            <View style={styles.menuIcon}>
              <Ionicons name={item.icon} size={22} color={colors.textStrong} />
            </View>
            <AppText variant="body1">{t(`friendAdd.${item.key}`)}</AppText>
          </Pressable>
        ))}
      </View>

      <View style={styles.section}>
        <AppText variant="label1" color={colors.textSecondary}>
          {t('friendAdd.otherApps')}
        </AppText>
        <View style={styles.apps}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('friendAdd.shareInvite')} onPress={shareInvite} style={styles.mailIcon}>
            <Ionicons name="mail" size={40} color={colors.white} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('friendAdd.shareInvite')} onPress={shareInvite} style={styles.shareIcon}>
            <Ionicons name="arrow-redo" size={22} color={colors.textStrong} />
          </Pressable>
        </View>
      </View>

      <View style={styles.section}>
        <AppText variant="label1" color={colors.textSecondary}>
          {t('friendAdd.peopleYouMayKnow')}
        </AppText>
        <View style={styles.syncBox}>
          <AppText variant="body1Bold">{t('friendAdd.contactSync')}</AppText>
          <AppText variant="label2" color={colors.textSecondary} align="center">
            {t('friendAdd.contactSyncDesc')}
          </AppText>
          <Button label={t('friendAdd.sync')} variant="brownLight" size="xs" shape="square" onPress={() => router.push('/friends/contacts')} />
        </View>
      </View>

      <UserIdModal
        visible={idModal}
        onClose={() => setIdModal(false)}
        onSent={(nickname) => {
          setIdModal(false);
          setSentTo(nickname);
        }}
      />
      <RequestSentPopup nickname={sentTo} onClose={() => setSentTo(null)} />
    </Screen>
  );
}

// 피그마에 ID 입력 화면이 없어 간단한 입력 팝업으로 구성
function UserIdModal({ visible, onClose, onSent }: { visible: boolean; onClose: () => void; onSent: (nickname: string) => void }) {
  const { t } = useTranslation();
  const [userId, setUserId] = useState('');
  const [error, setError] = useState<string>();
  const [searching, setSearching] = useState(false);
  const send = useSendFriendRequest();

  const submit = async () => {
    setSearching(true);
    setError(undefined);
    const user = await friendsApi.findUser(userId.trim()).catch(() => null);
    setSearching(false);
    if (!user) {
      setError(t('friendAdd.userNotFound'));
      return;
    }
    const blocked = blockedRequestReason(user);
    if (blocked) {
      setError(t(blocked));
      return;
    }
    send.mutate(user.id, {
      onSuccess: (result) => {
        setUserId('');
        if (result.status === 'accepted') {
          showToast(t('friendAdd.becameFriends', { name: user.nickname }));
          onClose();
        } else {
          onSent(user.nickname);
        }
      },
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => undefined}>
          <AppText variant="title4">{t('friendAdd.enterUserId')}</AppText>
          <TextField
            label={t('friendAdd.userId')}
            value={userId}
            onChangeText={(v) => {
              setUserId(v);
              setError(undefined);
            }}
            errorText={error}
            keyboardType="number-pad"
            autoFocus
          />
          <View style={styles.modalButtons}>
            <Button label={t('common.cancel')} variant="neutral" onPress={onClose} style={styles.flex} />
            <Button
              label={t('friendAdd.request')}
              variant="dark"
              disabled={!userId.trim() || searching || send.isPending}
              onPress={submit}
              style={styles.flex}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: { gap: 20, paddingTop: 0 },
  flex: { flex: 1 },
  outlineButton: {
    height: 38,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: '#6C6C71',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menu: { gap: 20 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { gap: 12 },
  apps: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  mailIcon: {
    width: 64,
    height: 64,
    borderRadius: 14,
    backgroundColor: '#1A8CFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncBox: { alignItems: 'center', gap: 8, paddingVertical: 12 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', paddingHorizontal: 20 },
  modalCard: { borderRadius: 10, backgroundColor: colors.popup, padding: 24, gap: 16 },
  modalButtons: { flexDirection: 'row', gap: 8 },
});
