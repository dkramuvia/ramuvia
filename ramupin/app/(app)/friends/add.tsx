import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Modal, Pressable, Share, View, type ImageSourcePropType } from 'react-native';

import { friendsApi } from '@/api';
import { AppText, Button, Screen, TextField } from '@/components/ui';
import { RequestSentPopup } from '@/features/friends/RequestSentPopup';
import { buildFriendQr } from '@/features/friends/qr';
import { useSendFriendRequest } from '@/features/friends/queries';
import { blockedRequestReason } from '@/features/friends/relation';
import { useAuthStore } from '@/stores/authStore';
import { makeStyles, radius, useColors } from '@/theme';
import { showToast } from '@/utils/toast';

type MenuItem = { key: string; icon: ImageSourcePropType; href: Href };

// 피그마 v3.1 친구추가 (7091:71486): 메뉴 아이콘은 입체 아이콘
const ICON_QR = require('../../../assets/icons/friend-qr.png');
const ICON_PIN = require('../../../assets/icons/friend-pin.png');

/** 위: 친구요청 대기 (받은 · 보낸 요청 목록으로) */
const PENDING: MenuItem[] = [
  { key: 'receivedRequests', icon: ICON_QR, href: { pathname: '/friends/requests', params: { tab: 'received' } } },
  { key: 'sentRequests', icon: ICON_PIN, href: { pathname: '/friends/requests', params: { tab: 'sent' } } },
];

const MENU: MenuItem[] = [
  { key: 'myQr', icon: ICON_QR, href: '/friends/my-qr' },
  { key: 'byContacts', icon: require('../../../assets/icons/friend-contacts.png'), href: '/friends/contacts' },
  { key: 'nearby', icon: ICON_PIN, href: '/friends/nearby' },
  { key: 'byQrScan', icon: require('../../../assets/icons/friend-qr-scan.png'), href: '/friends/qr-scan' },
];

/** 피그마: 친구 추가 (v3.1 7091:71486) */
export default function FriendAddScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const me = useAuthStore((s) => s.user);
  const [idModal, setIdModal] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const shareInvite = () => {
    if (!me) return;
    Share.share({ message: t('friendAdd.inviteMessage', { id: me.publicId, link: buildFriendQr(me.publicId) }) });
  };

  return (
    <Screen title={t('friendAdd.title')} tab="people" contentStyle={styles.content}>
      <View style={styles.section}>
        <AppText variant="body1Bold" color={colors.textStrong}>
          {t('friendAdd.pending')}
        </AppText>
        <MenuList items={PENDING} />
      </View>

      <View style={styles.section}>
        <AppText variant="body1Bold" color={colors.textStrong}>
          {t('friendAdd.title')}
        </AppText>
        <Pressable accessibilityRole="button" onPress={() => setIdModal(true)} style={styles.outlineButton}>
          <AppText variant="body2Bold" color={colors.textSecondary}>
            {t('friendAdd.byUserId')}
          </AppText>
        </Pressable>
        <MenuList items={MENU} />
      </View>

      <View style={styles.section}>
        <AppText variant="label1" color={colors.textSecondary}>
          {t('friendAdd.otherApps')}
        </AppText>
        <View style={styles.apps}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('friendAdd.shareInvite')} onPress={shareInvite} style={styles.app}>
            <Image source={require('../../../assets/icons/friend-mail.png')} style={styles.appIcon} />
            <AppText variant="caption" color={colors.textSecondary}>
              Mail
            </AppText>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('friendAdd.shareInvite')} onPress={shareInvite} style={styles.app}>
            <Image source={require('../../../assets/icons/friend-share.png')} style={styles.appIcon} />
            <AppText variant="caption" color={colors.textSecondary}>
              {t('friendAdd.share')}
            </AppText>
          </Pressable>
        </View>
      </View>

      {/* v3.1: '알 만한 사람' 제목을 빼고 연락처 동기화를 바로 둡니다 */}
      <View style={styles.syncBox}>
        <AppText variant="body1Bold" color={colors.textStrong} style={styles.syncTitle}>
          {t('friendAdd.contactSync')}
        </AppText>
        <AppText variant="label2" color={colors.textSecondary} align="center">
          {t('friendAdd.contactSyncDesc')}
        </AppText>
        <Button label={t('friendAdd.sync')} variant="brownLight" size="xs" shape="square" onPress={() => router.push('/friends/contacts')} />
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

function MenuList({ items }: { items: MenuItem[] }) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <View style={styles.menu}>
      {items.map((item) => (
        <Pressable key={item.key} accessibilityRole="button" onPress={() => router.push(item.href)} style={styles.menuItem}>
          <Image source={item.icon} style={styles.menuIcon} />
          <AppText variant="body1">{t(`friendAdd.${item.key}`)}</AppText>
        </Pressable>
      ))}
    </View>
  );
}

// 피그마에 ID 입력 화면이 없어 간단한 입력 팝업으로 구성
function UserIdModal({ visible, onClose, onSent }: { visible: boolean; onClose: () => void; onSent: (nickname: string) => void }) {
  const styles = useStyles();
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
    send.mutate({ userId: user.id }, {
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

const useStyles = makeStyles((colors) => ({
  content: { gap: 24, paddingTop: 8 },
  flex: { flex: 1 },
  outlineButton: {
    height: 38,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: '#6C6C71',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menu: { gap: 10 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // 피그마 40~45 크기 입체 아이콘
  menuIcon: { width: 44, height: 44 },
  section: { gap: 12 },
  apps: { flexDirection: 'row', alignItems: 'flex-start', gap: 20 },
  app: { alignItems: 'center', gap: 6 },
  appIcon: { width: 64, height: 64 },
  syncBox: { alignItems: 'center', gap: 8 },
  syncTitle: { alignSelf: 'stretch' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', paddingHorizontal: 20 },
  modalCard: { borderRadius: 10, backgroundColor: colors.popup, padding: 24, gap: 16 },
  modalButtons: { flexDirection: 'row', gap: 8 },
}));
