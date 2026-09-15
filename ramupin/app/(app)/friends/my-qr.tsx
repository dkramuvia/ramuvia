import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Avatar, BatteryBadge } from '@/components/ui';
import { buildFriendQr } from '@/features/friends/qr';
import { useAuthStore } from '@/stores/authStore';
import { colors, layout, radius } from '@/theme';
import { showToast } from '@/utils/toast';

const DECOR_HEIGHT = 150;

/** 피그마: 내 QR코드 (348:14774) */
export default function MyQrScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const me = useAuthStore((s) => s.user);
  if (!me) return null;

  const qrValue = buildFriendQr(me.id);

  const copyId = async () => {
    await Clipboard.setStringAsync(me.id);
    showToast(t('friendAdd.copied'));
  };

  return (
    <View style={styles.container}>
      {/* 장식 이미지는 맨 뒤에 깔고, 버튼·내용은 그 위에 */}
      <View style={[styles.decor, { height: DECOR_HEIGHT + insets.bottom }]} pointerEvents="none">
        <Image source={require('../../../assets/images/qr-deco-me.png')} style={styles.decoMe} />
        <Image source={require('../../../assets/images/qr-deco-cloud.png')} style={styles.decoCloud} />
        <Image source={require('../../../assets/images/qr-deco-r.png')} style={styles.decoR} />
      </View>

      <SafeAreaView edges={['top']} style={styles.flex}>
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: DECOR_HEIGHT + insets.bottom }]}>
          <View style={styles.titles}>
            <AppText variant="title2">{t('friendAdd.qrTitle')}</AppText>
            <AppText variant="label1Bold" color={colors.textSecondary}>
              {t('friendAdd.qrSubtitle')}
            </AppText>
          </View>

          <View style={styles.section}>
            <AppText variant="label2" color={colors.textSecondary}>
              {t('friendAdd.myProfile')}
            </AppText>
            <View style={styles.profileCard}>
              <Avatar name={me.nickname} imageUrl={me.avatarUrl} online />
              <View>
                <AppText variant="listTitle">{me.nickname}</AppText>
                <AppText variant="caption" color={colors.textTertiary}>
                  ID:{me.id}
                </AppText>
                {me.batteryLevel != null ? <BatteryBadge level={me.batteryLevel} iconSize={12} textVariant="microBold" /> : null}
              </View>
            </View>
          </View>

          <View style={styles.qrCard}>
            <Pressable accessibilityRole="button" onPress={copyId} style={styles.idPill}>
              <AppText variant="body2" color={colors.white}>
                {t('friendAdd.idLabel', { id: me.id })}
              </AppText>
              <Ionicons name="copy" size={16} color={colors.white} />
            </Pressable>
            <QRCode value={qrValue} size={150} color="#DCDCDC" backgroundColor="#2E2E2E" />
          </View>

          <View style={styles.actions}>
            {/* TODO: QR 이미지 저장 (expo-media-library 필요). 지금은 공유 시트로 대신 */}
            <RoundAction icon="download" label={t('friendAdd.saveQr')} onPress={() => Share.share({ message: qrValue })} />
            <RoundAction
              icon="arrow-redo"
              label={t('friendAdd.shareInvite')}
              onPress={() => Share.share({ message: t('friendAdd.inviteMessage', { id: me.id, link: qrValue }) })}
            />
            <RoundAction icon="scan" label={t('friendAdd.byQrScan')} onPress={() => router.replace('/friends/qr-scan')} />
          </View>
        </ScrollView>
      </SafeAreaView>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
        onPress={() => router.back()}
        style={[styles.close, { bottom: insets.bottom + 16 }]}
      >
        <Ionicons name="close" size={26} color={colors.textStrong} />
      </Pressable>
    </View>
  );
}

function RoundAction({ icon, label, onPress }: { icon: 'download' | 'arrow-redo' | 'scan'; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.roundAction}>
      <Ionicons name={icon} size={20} color={colors.textStrong} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  body: { paddingHorizontal: layout.screenPadding, paddingTop: 24, gap: 20 },
  titles: { gap: 4 },
  section: { gap: 12 },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceStrong,
  },
  qrCard: {
    alignSelf: 'center',
    width: 260,
    height: 270,
    borderRadius: 24,
    backgroundColor: '#2E2E2E',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  idPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radius.xs,
    backgroundColor: '#3A3A3A',
  },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: 40 },
  roundAction: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  decor: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  decoMe: { position: 'absolute', left: 16, top: 10, width: 90, height: 90 },
  decoCloud: { position: 'absolute', left: 120, top: 60, width: 190, height: 128 },
  decoR: { position: 'absolute', right: 40, top: 0, width: 120, height: 120 },
  close: {
    position: 'absolute',
    alignSelf: 'center',
    width: 44,
    height: 36,
    borderRadius: radius.xs,
    backgroundColor: 'rgba(227,230,232,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
